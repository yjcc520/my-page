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
-- 幂等：visit_sessions 上有 unique (day, ip_hash, started_at)，重复跑不会写重。
--
-- 🔒 IP 最小化（2026-10-25 起）：库里**不再保存完整 IP**。
--     只存两列：ip_hash（加盐 HMAC-SHA256 前 32 位，用于去重）与
--     ip_prefix（脱敏网段，如 111.203.16.*，用于归属参考）。
--     原始 IP 只在采集瞬间的内存里参与分组，不落库、不落盘。
--     盐值在 app_secrets.visit_ip_salt；删除它会让历史指纹全部失效。
--
-- ⚠️ 执行方式（2026-09-19 更新 · 首选直连脚本，不再依赖 MCP）
--
--   【首选】跑 `node tools/visit-snapshot.mjs`
--     用一条 Supabase PAT 直连 Management API，彻底绕开客户端启动竞速：
--       · 读日志  GET  /v1/projects/{ref}/analytics/endpoints/logs
--                 （旧端点 logs.all 于 2026-09-23 移除，新端点已实测可用）
--       · 写库    POST /v1/projects/{ref}/database/query
--       · 原始结果同时存档到 .workbuddy/visit-raw/YYYY-MM-DD.json（写库失败也不丢数据）
--     PAT 读取顺序：环境变量 SUPABASE_PAT → ~/.workbuddy/secrets/supabase-pat.txt
--     ⚠️ 本文件第 1 步的 SQL 与脚本内嵌 SQL 是同一份，改一边要同步另一边。
--
--   【实测坑】调日志端点**必须显式带 iso_timestamp_start / iso_timestamp_end**，
--     否则部分聚合查询会返回 `{"error":"Backend error! Retry your query."}` ——
--     而且它是 **HTTP 200**，只有检查 error 字段才能发现失败。
--     参数用 GET query string 传；该端点不支持 POST（返回 404）。
--     count(*) / count() 两种写法在带时间参数时都有效。
--
--   【备选】supabase MCP 的 query_logs / execute_sql
--     这两个工具能否注入是**一场启动竞速**：客户端 buildMcpServers() 里的
--     waitForServersReady() 是空方法（无 await），启动约 233ms 就冻结本会话工具清单；
--     而 supabase 是自定义远程 HTTP、在 12 个 MCP 队列里排后面，握手约 1.1s，经常输。
--     搜不到时**不要立刻宣布失败** —— 工具清单有延迟补装路径，实测同一会话稍后重搜可恢复。
--     先做别的事再重搜，最多 3 轮；连续 3 轮失败才放弃并如实说明，绝不编造数据。
--
--   【新端点规则（2026-09-23 生效）】失败返回 HTTP 200 + {"result":null,"error":"..."}，
--     「失败」和「当天无访客」长得一模一样，必须显式检查 error 字段才允许下结论。
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
  count() as req_count,
  multiIf(
    ual like '%MicroMessenger%', '微信',
    (ual like '%bot%' or ual like '%spider%' or ual like '%crawler%'), '爬虫',
    (
      ual = 'node' or ual like '%HeadlessChrome%'
      or ual like '%curl/%' or ual like '%Wget%'
      or ual like '%Python-urllib%' or ual like '%python-requests%'
      or ual like '%Go-http-client%' or ual like '%okhttp%' or ual like '%axios%'
      or ual like '%Electron%' or ual like '%WorkBuddy%'
    ), '脚本',
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
--   · <ip_hash> / <ip_prefix> 由下面的函数算，**不要把原始 ip 写进这条 SQL**：
--       ip_prefix = public._ip_prefix('<原始ip>')
--       ip_hash   = public._ip_hash('<原始ip>')     -- security definer，读 app_secrets 里的盐
--     日常跑 tools/visit-snapshot.mjs 时这一步已在 Node 里完成，不用手算。
-- ============================================================
insert into public.visit_sessions
  (day, started_at, ended_at, ip_hash, ip_prefix, channel, req_count, pages, referer, ua_sample, is_bot)
values
  ('<day>', '<started_at>Z', '<ended_at>Z', '<ip_hash>', '<ip_prefix>', '<channel>', <req_count>,
   '<pages>', <'<referer>' 或 null>, '<ua_sample>', <true|false>)
on conflict (day, ip_hash, started_at) do nothing;


-- ============================================================
-- 来源标注（ip_label 列，人工维护，每日快照不会覆盖）
-- ============================================================
-- 用途：免费 IP 库对国内运营商动态 IP 不准（同一 IP 在不同库里能横跨两省），
--       所以「这个人是谁」靠人工标注，比任何第三方库都可靠。
-- 标注方式（按网段定位 + 指纹前 8 位精确锁定；指纹在 visits.html 每行可见）：
--   update public.visit_sessions set ip_label = '<标签>'
--   where ip_prefix = '111.203.16.*' and left(ip_hash, 8) = '<指纹前8位>';
-- 备注：写入快照时不要 DELETE/TRUNCATE，只 insert + on conflict do nothing，
--       ip_label 才能留着。

-- 已知来源（2026-09 核验，数据源 ipinfo.io / ipwho.is 交叉；只记网段，不记完整 IP）
--   111.203.16.*    北京联通 AS4808          → 站长本人（主用出口，量最大）
--   124.127.67.*    北京联通 AS4847 (163data) → 站长本人（手机/蜂窝网络）
--   124.127.71.*    北京联通 AS4847 (163data) → 站长本人（手机/蜂窝网络）
--   223.104.132.*   中国移动 AS56047         → **外部访客**，ipwho.is 判为湖南长沙
--                                              （ipinfo 判浙江嘉兴，两库冲突，
--                                               移动动态池查不准，待人工确认）
--   85.234.83.*     东京 G-Core Labs AS199524 → 疑似代理/VPN，建议按可疑处理
--   199.30.25.*     微软 AS8075 (msnbot)      → Bing 爬虫（channel 已判为"爬虫"）

-- 湖南访客的完整轨迹（唯一有行为证据的外部真人）
select day,
       started_at + interval '8 hour' as t_bj,
       channel, req_count, pages
from public.visit_sessions
where ip_prefix = '223.104.132.*'
order by started_at;

-- 只看外部真人（排除站长自己）
select day, started_at + interval '8 hour' as t_bj,
       ip_prefix, left(ip_hash, 8) as fp, ip_label, channel, req_count, pages
from public.visit_sessions
where ip_label is not null
  and ip_label not like '站长%'
order by started_at desc;


-- ============================================================
-- 日常查看（走 MCP 直接查，或给站长看的 visits.html）
-- ============================================================
-- 某天有谁来过（排除自己的脚本和爬虫）
-- select started_at + interval '8 hour' as t_bj, ip_prefix, left(ip_hash,8) as fp,
--        ip_label, channel, req_count, pages
-- from public.visit_sessions
-- where day = '2026-09-11' and channel not in ('脚本','爬虫')
-- order by started_at;
--
-- 每日概览
-- select day,
--        count(*) filter (where channel not in ('脚本','爬虫')) as visits,
--        count(distinct ip_hash) filter (where channel not in ('脚本','爬虫')) as uniq_source,
--        sum(req_count) as reqs
-- from public.visit_sessions group by day order by day desc;
