-- ============================================================
-- caizihan.cn 访问快照 · 每日任务用
-- ============================================================
-- 背景：站点是 GitHub Pages 静态托管，本身不留访问日志；GitHub traffic API
--       只统计 github.io 域名，自定义域名 caizihan.cn 不计入；不蒜子只有
--       累计总数（无按日）。唯一能还原访客轨迹的是 Supabase 统一日志
--       （edge_logs），但它**只保留最近 24 小时** —— 所以必须每天跑一次，
--       否则当天的访问记录永久消失。
--
-- 执行方式：第 1 步用日志查询（只读，只保留 24h 窗口）跑出「访问会话」，
--           第 2 步把结果写入 public.visit_sessions。
--
-- 会话定义：同一 IP + 同一 UA + 同一个 30 分钟时间桶，合并为一次会话。
--           （同一个人手机微信 + 电脑微信会分成两次，这是对的）
-- 渠道分类：微信 / 桌面浏览器 / 手机浏览器 / 爬虫 / 脚本
-- 幂等：visit_sessions 上有 unique (day, ip, started_at)，重复跑不会写重。
-- ============================================================


-- ============================================================
-- 第 1 步：查询（Supabase 日志后端是 ClickHouse，不支持 substring(timestamp)，
--         但支持 toStartOfInterval / multiIf / groupUniqArray）
-- ============================================================
select
  toDate(min(timestamp) + interval 8 hour) as day,          -- 北京时间日期
  min(timestamp) as started_at,
  max(timestamp) as ended_at,
  ip,
  count(*) as req_count,
  multiIf(
    ual like '%MicroMessenger%', '微信',
    (ual like '%bot%' or ual like '%spider%' or ual like '%crawler%'), '爬虫',
    (ual = 'node' or ual like '%HeadlessChrome%'), '脚本',
    ual like '%Mobile%', '手机浏览器',
    '桌面浏览器'
  ) as channel,
  arrayStringConcat(arraySlice(groupUniqArray(page), 1, 15), ' / ') as pages,
  anyLast(ref) as referer,
  ual as ua_sample
from (
  select
    toDateTime(timestamp) as timestamp,
    log_attributes['request.headers.cf_connecting_ip'] as ip,
    log_attributes['request.headers.referer'] as ref,
    log_attributes['request.headers.user_agent'] as ual,
    multiIf(
      (log_attributes['request.path'] like '%/articles%'
        and log_attributes['request.search'] like '%id=eq.%'), '文章详情',
      log_attributes['request.path'] like '%/articles%',    '文章列表',
      log_attributes['request.path'] like '%/posts%',       '论坛',
      log_attributes['request.path'] like '%/photos%',      '画廊',
      log_attributes['request.path'] like '%/storage/v1/object%', '画廊图片',
      log_attributes['request.path'] like '%/score_board%', '榜单',
      log_attributes['request.path'] like '%/comments%',    '评论',
      log_attributes['request.path'] like '%/notes%',       '留言墙',
      log_attributes['request.path'] like '%bump_views%',   '阅读计数',
      log_attributes['request.path'] like '%/auth/v1%',     '登录注册',
      log_attributes['request.path']
    ) as page
  from logs
  where source = 'edge_logs'
    and log_attributes['request.method'] <> 'OPTIONS'      -- 去掉 CORS 预检，否则请求数翻倍
    and log_attributes['request.path'] not like '%/admin/%' -- 去掉 Supabase 内部运维调用
) t
group by ip, toStartOfInterval(timestamp, interval 30 minute), ual
order by started_at desc
limit 200;


-- ============================================================
-- 第 2 步：写入（把上一步每行套进 values）
--   · started_at / ended_at 是 UTC 裸时间（如 2026-09-12T10:33:53），拼 Z 后缀
--   · pages 里的单引号需转义为两个单引号；referer 为空写 null
--   · is_bot 取自 channel = '爬虫'
-- ============================================================
insert into public.visit_sessions
  (day, started_at, ended_at, ip, channel, req_count, pages, referer, ua_sample, is_bot)
values
  ('<day>', '<started_at>Z', '<ended_at>Z', '<ip>', '<channel>', <req_count>,
   '<pages>', <'<referer>' 或 null>, '<ua_sample>', <true|false>)
on conflict (day, ip, started_at) do nothing;


-- ============================================================
-- 日常查看（走 MCP 直接查，或给站长看的 visits.html）
-- ============================================================
-- 某天有谁来过（排除自己的脚本和爬虫）
-- select started_at + interval '8 hour' as t_bj, ip, channel, req_count, pages
-- from public.visit_sessions
-- where day = '2026-09-11' and channel not in ('脚本','爬虫')
-- order by started_at;
--
-- 每日概览
-- select day,
--        count(*) filter (where channel not in ('脚本','爬虫')) as visits,
--        count(distinct ip) filter (where channel not in ('脚本','爬虫')) as uniq_ip,
--        sum(req_count) as reqs
-- from public.visit_sessions group by day order by day desc;
