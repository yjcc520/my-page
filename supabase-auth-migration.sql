-- ============================================================================
--  caizihan.cn · 站点账号体系（第二轮）
--
--  前提：已经执行过 supabase-schema.sql
--  用法：Supabase 控制台 → SQL Editor → New query → 粘贴全文 → Run
--  可重复执行，不会报错
--
--  这一轮做了什么：
--   1. 新增 profiles 表 —— 昵称即账号，注册时自动创建
--   2. 内容表挂上 user_id，并在写入时由数据库强制盖章：
--        昵称一律取服务端记录的真实昵称，前端无法冒用他人身份
--   3. 收紧权限：从「谁都能写」改成「登录后才能写」，删除只限本人
--   ============================================================================


-- ============================ 1. 用户资料 ============================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text        not null,
  created_at timestamptz not null default now(),
  constraint profiles_nickname_len check (char_length(btrim(nickname)) between 1 and 20)
);

-- 昵称大小写不敏感地唯一，避免出现「Zihan」和「zihan」两个账号
create unique index if not exists profiles_nickname_uniq
  on public.profiles (lower(btrim(nickname)));

alter table public.profiles enable row level security;

drop policy if exists pr_read   on public.profiles;
drop policy if exists pr_update on public.profiles;
create policy pr_read   on public.profiles for select using (true);
create policy pr_update on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);


-- 注册时自动建资料。昵称取自注册表单；万一重名则自动加后缀（正常不会走到）
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  nn   text;
  i    int := 0;
begin
  base := left(btrim(coalesce(new.raw_user_meta_data->>'nickname', '')), 16);
  if base = '' then base := '书友'; end if;
  nn := base;
  while exists (select 1 from public.profiles where lower(btrim(nickname)) = lower(nn)) loop
    i := i + 1;
    nn := base || i::text;
    if i > 500 then nn := base || substr(new.id::text, 1, 4); exit; end if;
  end loop;
  insert into public.profiles (id, nickname) values (new.id, nn)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================ 2. 内容表挂上用户 ============================
alter table public.comments add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.notes    add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.posts    add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.photos   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.scores   add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists comments_user_idx on public.comments (user_id);
create index if not exists notes_user_idx    on public.notes    (user_id);
create index if not exists posts_user_idx    on public.posts    (user_id);
create index if not exists photos_user_idx   on public.photos   (user_id);
create index if not exists scores_user_idx   on public.scores   (user_id);


-- ============================ 3. 写入时盖章（防冒名） ============================
-- 前端传上来的 nickname / uploader / user_id 一律被覆盖，
-- 昵称只能等于当前登录账号在 profiles 里的昵称。
create or replace function public._me_nickname()
returns text
language sql security definer set search_path = public stable as $$
  select nickname from public.profiles where id = auth.uid()
$$;

create or replace function public.stamp_comments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nickname := public._me_nickname();
  new.user_id  := auth.uid();
  new.secret   := '';
  if new.nickname is null then raise exception '请先登录后再发言'; end if;
  return new;
end $$;

create or replace function public.stamp_notes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nickname := public._me_nickname();
  new.user_id  := auth.uid();
  new.secret   := '';
  if new.nickname is null then raise exception '请先登录后再留言'; end if;
  return new;
end $$;

create or replace function public.stamp_posts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nickname := public._me_nickname();
  new.user_id  := auth.uid();
  new.secret   := '';
  if new.nickname is null then raise exception '请先登录后再发帖'; end if;
  return new;
end $$;

create or replace function public.stamp_photos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.uploader := public._me_nickname();
  new.user_id  := auth.uid();
  new.secret   := '';
  if new.uploader is null then raise exception '请先登录后再上传'; end if;
  return new;
end $$;

create or replace function public.stamp_scores() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nickname := public._me_nickname();
  new.user_id  := auth.uid();
  if new.nickname is null then raise exception '请先登录后再提交成绩'; end if;
  return new;
end $$;

drop trigger if exists st_comments on public.comments;
drop trigger if exists st_notes    on public.notes;
drop trigger if exists st_posts    on public.posts;
drop trigger if exists st_photos   on public.photos;
drop trigger if exists st_scores   on public.scores;

create trigger st_comments before insert on public.comments for each row execute function public.stamp_comments();
create trigger st_notes    before insert on public.notes    for each row execute function public.stamp_notes();
create trigger st_posts    before insert on public.posts    for each row execute function public.stamp_posts();
create trigger st_photos   before insert on public.photos   for each row execute function public.stamp_photos();
create trigger st_scores   before insert on public.scores   for each row execute function public.stamp_scores();


-- ============================ 4. 收紧权限 ============================
-- 读取：保持所有人可读
-- 写入：必须是登录用户，且只能新增自己的内容
-- 删除：只能删自己的

drop policy if exists c_insert on public.comments;
drop policy if exists n_insert on public.notes;
drop policy if exists p_insert on public.posts;
drop policy if exists s_insert on public.scores;
drop policy if exists g_insert on public.photos;

drop policy if exists c_delete on public.comments;
drop policy if exists n_delete on public.notes;
drop policy if exists p_delete on public.posts;
drop policy if exists g_delete on public.photos;

create policy c_insert on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy n_insert on public.notes    for insert to authenticated with check (user_id = auth.uid());
create policy p_insert on public.posts    for insert to authenticated with check (user_id = auth.uid());
create policy s_insert on public.scores   for insert to authenticated with check (user_id = auth.uid());
create policy g_insert on public.photos   for insert to authenticated with check (user_id = auth.uid());

create policy c_delete on public.comments for delete to authenticated using (user_id = auth.uid());
create policy n_delete on public.notes    for delete to authenticated using (user_id = auth.uid());
create policy p_delete on public.posts    for delete to authenticated using (user_id = auth.uid());
create policy g_delete on public.photos   for delete to authenticated using (user_id = auth.uid());

-- 点赞：登录用户可给评论 / 帖子点赞。只能 +1，不能改数字
create or replace function public.like_comment(p_id bigint)
returns integer language sql security definer set search_path = public as $$
  update public.comments set likes = likes + 1
   where id = p_id returning likes;
$$;

create or replace function public.like_post(p_id bigint)
returns integer language sql security definer set search_path = public as $$
  update public.posts set likes = likes + 1
   where id = p_id returning likes;
$$;

grant execute on function public.like_comment(bigint) to anon, authenticated;
grant execute on function public.like_post(bigint)    to anon, authenticated;
grant execute on function public.bump_post_views(bigint) to anon, authenticated;

-- 图片桶：只有登录用户能上传
drop policy if exists gallery_obj_insert on storage.objects;
create policy gallery_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery');


-- ============================ 5. 刷新接口缓存 ============================
-- 让 PostgREST 立刻认识新表和新字段，省得等它自己发现
notify pgrst, 'reload schema';


-- ============================ 6. 自检 ============================
-- 执行完可以单独跑这几句看看
--   select proname from pg_proc where proname like 'stamp%';          应列出 5 个函数
--   select table_name, column_name from information_schema.columns
--     where table_name in ('comments','notes','posts','scores','photos')
--       and column_name = 'user_id';                                  应列出 5 行
--   select tablename, policyname, cmd, roles from pg_policies
--     where tablename in ('comments','notes','posts','scores','photos')
--     order by tablename, cmd;                                        写入策略的 roles 应为 {authenticated}


-- ============================================================================
--  提醒：还需要在控制台做一件事
--  Authentication → Sign In / Providers → Email → 关掉 "Confirm email"
--  否则注册后会卡在等邮件验证，而 Supabase 自带邮件服务有严格频率限制，
--  实际收不到信。站点用的是「昵称 + 密码」，本来就不需要邮箱验证。
-- ============================================================================
