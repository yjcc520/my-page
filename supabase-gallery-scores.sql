-- ============================================================================
-- 画廊上传 + 游戏排行榜接入 Supabase（2026-09-11）
--
-- 本文件记录本次改动涉及的全部 DDL，已在 project euhdfzgxxzavwqsgxmoy 执行。
-- 对应前端改动：gallery.html（上传/删除改造）、leaderboard.js（新建，9 个游戏页共用）、
--              index.html（首页榜单改读数据库）、sb.js（新增 removeStorage）
--
-- 执行方式：Supabase MCP apply_migration，或 SQL Editor 整段跑一次。
-- 全部语句幂等，可重复执行。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 画廊图片桶
--    图片本体放 Storage，photos 表只存路径（bucket 内相对路径）+ 元数据。
--    单文件上限 5MB，只收图片类型。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Storage 对象策略
--    ⚠️ 关键坑：建桶时 Supabase 会自动生成 gallery_obj_insert / gallery_obj_read
--    （with_check 只校验 bucket_id）。RLS 多策略之间是 OR 关系，那条宽松策略会
--    把下面的「只能写自己目录」完全架空 —— 实测 A 能往 B 的目录里传文件。
--    必须先删掉自动生成的策略，再建严格的。
-- ---------------------------------------------------------------------------
drop policy if exists "gallery_obj_insert" on storage.objects;
drop policy if exists "gallery_obj_read"   on storage.objects;

drop policy if exists "gallery_read" on storage.objects;
create policy "gallery_read" on storage.objects
  for select to public
  using (bucket_id = 'gallery');

-- 路径约定：<auth.uid()>/<时间戳>-<随机>.ext
-- 用 name 的第一段作为属主目录，确保用户之间不能互相覆盖
drop policy if exists "gallery_insert" on storage.objects;
create policy "gallery_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "gallery_delete" on storage.objects;
create policy "gallery_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gallery'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 3. photos 表：补 caption 列（可空默认空串，不影响既有数据）
--    上传者与归属由 stamp_photos() 触发器盖章，与其它表一致。
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'photos' and column_name = 'caption'
  ) then
    alter table public.photos add column caption text not null default '';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. scores 表：索引 + 本人可改/可删
--    保留原始提交历史（每次提交一行），榜单取 max 由视图负责。
-- ---------------------------------------------------------------------------
create index if not exists scores_game_score_idx on public.scores (game, score desc);
create index if not exists scores_game_user_idx  on public.scores (game, user_id);

drop policy if exists "s_update" on public.scores;
create policy "s_update" on public.scores
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "s_delete" on public.scores;
create policy "s_delete" on public.scores
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. 排行榜聚合视图：同一人同一游戏只出现一行（取最高分），附带游玩次数
--    前端查 score_board 即可，不用自己聚合。
-- ---------------------------------------------------------------------------
create or replace view public.score_board as
  select game,
         nickname,
         max(score)      as best,
         count(*)        as plays,
         max(created_at) as last_at
  from public.scores
  group by game, nickname;

grant select on public.score_board to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. rate_limit()：原为「全表每分钟 30 条」的粗暴限流，多人同时提交会互相误伤。
--    改为按提交者限流（每分钟 30 条）；未登录时按表总量兜底（每分钟 60 条）。
--    顺带补上 search_path（安全顾问 0011 提示）。
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer; me uuid;
begin
  me := auth.uid();
  if me is null then
    execute format(
      'select count(*) from public.%I where created_at > now() - interval ''1 minute''',
      tg_table_name) into n;
    if n >= 60 then raise exception '提交过于频繁，请稍后再试'; end if;
  else
    execute format(
      'select count(*) from public.%I where created_at > now() - interval ''1 minute'' and user_id = $1',
      tg_table_name) into n using me;
    if n >= 30 then raise exception '提交过于频繁，请稍后再试'; end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 7. stamp_scores()：补迁移旁路，与 stamp_articles / stamp_posts 保持一致。
--    无会话时（迁移脚本 / SQL Editor）放行，可写入指定昵称的历史数据；
--    匿名 apikey 走不到这里（RLS 的 to authenticated 先拦住）。
-- ---------------------------------------------------------------------------
create or replace function public.stamp_scores()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  new.nickname := public._me_nickname();
  new.user_id  := auth.uid();
  if new.nickname is null then raise exception '请先登录后再提交成绩'; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 8. 收回不该公开的函数执行权（安全顾问 0028 / 0029）
--    stamp_* / handle_new_user / rate_limit 只应由触发器内部调用，
--    不必暴露成 /rest/v1/rpc/* 端点。触发器执行不走权限检查，功能不受影响。
-- ---------------------------------------------------------------------------
revoke execute on function public.stamp_articles()  from public, anon, authenticated;
revoke execute on function public.stamp_posts()     from public, anon, authenticated;
revoke execute on function public.stamp_comments()  from public, anon, authenticated;
revoke execute on function public.stamp_notes()     from public, anon, authenticated;
revoke execute on function public.stamp_photos()    from public, anon, authenticated;
revoke execute on function public.stamp_scores()    from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rate_limit()      from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. 顺带给 bump_views / bump_post_views 补 search_path（安全顾问 0011）
-- ---------------------------------------------------------------------------
create or replace function public.bump_views(p_table text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_table = 'articles' then
    update articles set views = views + 1 where id = p_id;
  elsif p_table = 'posts' then
    update posts set views = views + 1 where id = p_id;
  end if;
end $$;

create or replace function public.bump_post_views(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update posts set views = views + 1 where id = p_id;
$$;

notify pgrst, 'reload schema';
