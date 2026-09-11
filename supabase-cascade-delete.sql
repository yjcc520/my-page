-- ============================================================================
--  删文章 / 帖子时，连同它下面的评论一起清掉
--  ---------------------------------------------------------------------------
--  为什么要放到数据库里做：
--    comments 的删除策略是「只能删自己发的」。文章作者去删别人留在他文下的
--    评论，会被这条策略拦住。把整个删除动作收进一个 security definer 函数，
--    由数据库先确认调用者确实是这篇文章的作者，再放开手脚清理它名下的评论。
--    越权依然不可能 —— 函数内部第一步就是按 user_id = auth.uid() 筛。
--
--  在 Supabase 控制台 → 左侧 SQL Editor → New query 里整段粘进去跑一次。
--  可重复执行，跑几次都不会出问题。
-- ============================================================================


-- ---------------------------------------------------------------- 1. 文章

create or replace function public.delete_article(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  hit   boolean := false;
begin
  if v_uid is null then
    raise exception '请先登录';
  end if;

  -- 只有属于你自己的那一行会被筛出来；别人的行这里根本碰不到
  delete from public.articles
   where id = p_id and user_id = v_uid
   returning true into hit;

  if not coalesce(hit, false) then
    return false;                        -- 不是你的，或已经不存在了
  end if;

  -- 文章没了，挂在它下面的评论与回复也一并清掉，不留孤儿数据
  delete from public.comments where path = 'article-' || p_id;
  return true;
end $$;


-- ---------------------------------------------------------------- 2. 帖子

create or replace function public.delete_post(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  hit   boolean := false;
begin
  if v_uid is null then
    raise exception '请先登录';
  end if;

  delete from public.posts
   where id = p_id and user_id = v_uid
   returning true into hit;

  if not coalesce(hit, false) then
    return false;
  end if;

  delete from public.comments where path = 'forum-' || p_id;
  return true;
end $$;


-- ---------------------------------------------------------------- 3. 权限
-- 只有登录用户可以调用这两个函数。未登录访客连函数都进不去，
-- 页面上的删除按钮对未登录用户本来也不显示。

revoke all on function public.delete_article(bigint) from public;
revoke all on function public.delete_post(bigint)    from public;
revoke all on function public.delete_article(bigint) from anon;
revoke all on function public.delete_post(bigint)    from anon;
grant execute on function public.delete_article(bigint) to authenticated;
grant execute on function public.delete_post(bigint)    to authenticated;


-- ------------------------------------------------- 4. 清理已有的孤儿评论
-- 以前删文章只是把文章删了，评论留在库里没人管 —— 界面上永远看不到，
-- 但一直占着位置。这里一次性扫干净：凡是指向已不存在内容的评论行都删掉。

delete from public.comments c
 where c.path in ('/article.html', '/forum.html')
    or (c.path ~ '^article-[0-9]+$'
        and not exists (select 1 from public.articles a where 'article-' || a.id = c.path))
    or (c.path ~ '^forum-[0-9]+$'
        and not exists (select 1 from public.posts    p where 'forum-'   || p.id = c.path));


-- ---------------------------------------------- 5. 让接口立刻认识这两个函数
-- 不加这句，刚建的函数要等一会儿才能被 REST 接口调通。

notify pgrst, 'reload schema';
