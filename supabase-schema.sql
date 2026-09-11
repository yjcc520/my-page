-- ============================================================================
--  caizihan.cn 站点数据表（Supabase / PostgreSQL）
--
--  用法：Supabase 控制台 → 左侧 SQL Editor → New query → 粘贴全文 → Run
--  可以重复执行，不会重复建表也不报错
--
--  设计原则：
--   · 读取全部开放（匿名也能读）
--   · 写入只允许「新增」，且受长度限制 + 频率限制（挡脚本刷）
--   · 前端拿不到删除权限。删除自己发的内容要靠本地保存的随机串 secret 校验
--   · 数据库密钥是 Supabase 的 anon key，它本来就是设计成公开给前端用的，
--     安全性全部由下面的行级策略负责
-- ============================================================================


-- ============================== 1. 通用评论 ==============================
-- 用于文章页（path = 'article-12'）和画廊（path = 'gallery'）
create table if not exists public.comments (
  id          bigserial primary key,
  path        text        not null,
  parent_id   bigint      references public.comments(id) on delete cascade,
  nickname    text        not null,
  body        text        not null,
  likes       integer     not null default 0,
  secret      text        not null default '',
  created_at  timestamptz not null default now(),
  constraint comments_nickname_len check (char_length(nickname) between 1 and 20),
  constraint comments_body_len     check (char_length(body)     between 1 and 2000)
);
create index if not exists comments_path_idx on public.comments (path, created_at desc);


-- ============================== 2. 留言墙便签 ==============================
create table if not exists public.notes (
  id          bigserial primary key,
  nickname    text        not null,
  body        text        not null,
  secret      text        not null default '',
  created_at  timestamptz not null default now(),
  constraint notes_nickname_len check (char_length(nickname) between 1 and 20),
  constraint notes_body_len     check (char_length(body)     between 1 and 200)
);
create index if not exists notes_created_idx on public.notes (created_at desc);


-- ============================== 3. 论坛帖子 ==============================
-- 帖子回复沿用 comments 表，path = 'forum-<帖子id>'
create table if not exists public.posts (
  id          bigserial primary key,
  category    text        not null default 'chat',
  nickname    text        not null,
  title       text        not null,
  body        text        not null,
  is_pinned   boolean     not null default false,
  views       integer     not null default 0,
  likes       integer     not null default 0,
  secret      text        not null default '',
  created_at  timestamptz not null default now(),
  constraint posts_nickname_len check (char_length(nickname) between 1 and 20),
  constraint posts_title_len    check (char_length(title)    between 1 and 100),
  constraint posts_body_len     check (char_length(body)     between 1 and 5000)
);
create index if not exists posts_created_idx on public.posts (created_at desc);


-- ============================== 4. 游戏排行榜 ==============================
create table if not exists public.scores (
  id          bigserial primary key,
  game        text        not null,
  nickname    text        not null,
  score       integer     not null,
  created_at  timestamptz not null default now(),
  constraint scores_nickname_len check (char_length(nickname) between 1 and 20)
);
create index if not exists scores_game_idx on public.scores (game, score desc);


-- ============================== 5. 画廊照片 ==============================
-- 图片本体存进 Storage 的 gallery 桶，这里只存地址
create table if not exists public.photos (
  id          bigserial primary key,
  url         text        not null,
  uploader    text        not null,
  secret      text        not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists photos_created_idx on public.photos (created_at desc);


-- ============================== 6. 图片存储桶 ==============================
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;


-- ============================================================================
--  行级安全策略
-- ============================================================================
alter table public.comments enable row level security;
alter table public.notes    enable row level security;
alter table public.posts    enable row level security;
alter table public.scores   enable row level security;
alter table public.photos   enable row level security;

-- ---- 读取：所有人（含未登录访客）可读 ----
drop policy if exists c_read on public.comments;
drop policy if exists n_read on public.notes;
drop policy if exists p_read on public.posts;
drop policy if exists s_read on public.scores;
drop policy if exists g_read on public.photos;
create policy c_read on public.comments for select using (true);
create policy n_read on public.notes    for select using (true);
create policy p_read on public.posts    for select using (true);
create policy s_read on public.scores   for select using (true);
create policy g_read on public.photos   for select using (true);

-- ---- 写入：只允许新增，且昵称/内容不能为空 ----
drop policy if exists c_insert on public.comments;
drop policy if exists n_insert on public.notes;
drop policy if exists p_insert on public.posts;
drop policy if exists s_insert on public.scores;
drop policy if exists g_insert on public.photos;
create policy c_insert on public.comments for insert with check (
  char_length(btrim(nickname)) > 0 and char_length(btrim(body)) > 0
);
create policy n_insert on public.notes for insert with check (
  char_length(btrim(nickname)) > 0 and char_length(btrim(body)) > 0
);
create policy p_insert on public.posts for insert with check (
  char_length(btrim(nickname)) > 0 and char_length(btrim(title)) > 0 and char_length(btrim(body)) > 0
);
create policy s_insert on public.scores for insert with check (
  char_length(btrim(nickname)) > 0 and score >= 0
);
create policy g_insert on public.photos for insert with check (
  char_length(btrim(uploader)) > 0 and url like 'http%'
);

-- ---- 图片桶的读写 ----
drop policy if exists gallery_obj_read on storage.objects;
drop policy if exists gallery_obj_insert on storage.objects;
create policy gallery_obj_read   on storage.objects for select using (bucket_id = 'gallery');
create policy gallery_obj_insert on storage.objects for insert with check (bucket_id = 'gallery');


-- ============================================================================
--  频率限制：每张表每分钟最多 30 条，挡掉脚本刷屏
-- ============================================================================
create or replace function public.rate_limit() returns trigger
language plpgsql security definer as $$
declare n integer;
begin
  execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute''', tg_table_name)
    into n;
  if n >= 30 then
    raise exception '提交过于频繁，请稍后再试';
  end if;
  return new;
end $$;

drop trigger if exists rl_comments on public.comments;
drop trigger if exists rl_notes    on public.notes;
drop trigger if exists rl_posts    on public.posts;
drop trigger if exists rl_scores   on public.scores;
drop trigger if exists rl_photos   on public.photos;
create trigger rl_comments before insert on public.comments for each row execute function public.rate_limit();
create trigger rl_notes    before insert on public.notes    for each row execute function public.rate_limit();
create trigger rl_posts    before insert on public.posts    for each row execute function public.rate_limit();
create trigger rl_scores   before insert on public.scores   for each row execute function public.rate_limit();
create trigger rl_photos   before insert on public.photos   for each row execute function public.rate_limit();


-- ============================================================================
--  删除自己发的内容（靠本地保存的 secret 校验，不需要登录）
-- ============================================================================
create or replace function public.delete_own(p_table text, p_id bigint, p_secret text)
returns boolean language plpgsql security definer as $$
declare ok boolean := false;
begin
  if p_secret is null or p_secret = '' then return false; end if;
  if p_table = 'notes' then
    delete from public.notes    where id = p_id and secret = p_secret returning true into ok;
  elsif p_table = 'comments' then
    delete from public.comments where id = p_id and secret = p_secret returning true into ok;
  elsif p_table = 'posts' then
    delete from public.posts    where id = p_id and secret = p_secret returning true into ok;
  elsif p_table = 'photos' then
    delete from public.photos   where id = p_id and secret = p_secret returning true into ok;
  end if;
  return coalesce(ok, false);
end $$;


-- ============================================================================
--  浏览数自增（只能加 1，不能改数字）
-- ============================================================================
create or replace function public.bump_post_views(p_id bigint)
returns void language sql security definer as $$
  update public.posts set views = views + 1 where id = p_id;
$$;


-- ============================================================================
--  开放调用权限
-- ============================================================================
grant execute on function public.delete_own(text, bigint, text) to anon, authenticated;
grant execute on function public.bump_post_views(bigint)        to anon, authenticated;
