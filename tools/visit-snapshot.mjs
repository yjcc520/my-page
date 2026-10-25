#!/usr/bin/env node
/**
 * caizihan.cn 每日访问快照 · 直连 Supabase Management API 版本
 * ------------------------------------------------------------------
 * 为什么不用 MCP：WorkBuddy 客户端 buildMcpServers() 里 waitForServersReady()
 * 是空方法（无 await），启动约 233ms 就冻结会话工具清单；supabase 是自定义
 * 远程 HTTP、在 12 个 MCP 队列里排后面，握手 ~1.1s，经常输 → 工具搜不到。
 * 本脚本改用一条 sbp_ PAT 直连 REST，彻底绕开启动竞速。
 *
 * 用法：
 *   node tools/visit-snapshot.mjs            正常跑（查日志 + 写库）
 *   node tools/visit-snapshot.mjs --dry-run  只查日志、只存档，不写库
 *
 * Token 来源（按顺序）：
 *   1) 环境变量 SUPABASE_PAT
 *   2) %USERPROFILE%\.workbuddy\secrets\supabase-pat.txt
 *
 * 端点：
 *   读日志  GET  /v1/projects/{ref}/analytics/endpoints/logs
 *           （旧端点 logs.all 将于 2026-09-23 移除，这里直接用新端点）
 *   写库    POST /v1/projects/{ref}/database/query
 * ------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const REF = "euhdfzgxxzavwqsgxmoy";
const BASE = `https://api.supabase.com/v1/projects/${REF}`;
const TOKEN_FILE = path.join(os.homedir(), ".workbuddy", "secrets", "supabase-pat.txt");
const RAW_DIR = path.join(process.cwd(), ".workbuddy", "visit-raw");
const DRY_RUN = process.argv.includes("--dry-run");

/* ---------- 会话定义 SQL（与 visit-snapshot.sql 第 1 步保持一致） ---------- */
const SESSION_SQL = `
select
  toDate(min(timestamp) + interval 8 hour) as day,
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
    and log_attributes['request.method'] <> 'OPTIONS'
    and log_attributes['request.path'] not like '%/admin/%'
) t
group by ip, toStartOfInterval(timestamp, interval 30 minute), ual
order by started_at desc
limit 200
`.trim();

/* ---------- token ---------- */
function getToken() {
  const env = process.env.SUPABASE_PAT;
  if (env && env.trim()) return env.trim();
  if (fs.existsSync(TOKEN_FILE)) {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t) return t;
  }
  throw new Error(
    `找不到 Supabase PAT。请设置环境变量 SUPABASE_PAT，或把 token 写入 ${TOKEN_FILE}`
  );
}

/* ---------- 通用请求（读日志要 query string，写库要 JSON body） ---------- */
async function readLogs(token, sql, start, end) {
  const url = new URL(`${BASE}/analytics/endpoints/logs`);
  url.searchParams.set("sql", sql);
  url.searchParams.set("iso_timestamp_start", start);
  url.searchParams.set("iso_timestamp_end", end);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }

  // ⚠️ 关键：日志端点失败也返回 HTTP 200，只有 error 字段能区分
  //    「查询失败」和「当天真的没有访客」。绝不能把 error 当成空结果。
  if (json && json.error) {
    throw new Error(`日志查询失败（HTTP ${res.status}）: ${json.error}`);
  }
  if (!res.ok || !json || !Array.isArray(json.result)) {
    throw new Error(`日志查询异常（HTTP ${res.status}）: ${text.slice(0, 300)}`);
  }
  return json.result;
}

async function runSql(token, query) {
  const res = await fetch(`${BASE}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  if (!res.ok) {
    throw new Error(`写库失败（HTTP ${res.status}）: ${text.slice(0, 500)}`);
  }
  return json;
}

/* ---------- SQL 字面量 ---------- */
function q(v) {
  if (v === null || v === undefined || v === "") return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}

/* ---------- IP 最小化：只保留加盐指纹 + 脱敏网段 ---------- */
function ipHash(ip, salt) {
  if (!ip) return null;
  return crypto.createHmac("sha256", salt).update(ip, "utf8").digest("hex").slice(0, 32);
}

function ipPrefix(ip) {
  if (!ip) return null;
  if (ip.includes(":")) return ip.slice(0, 12).replace(/:+$/, "") + "::*";
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return parts.slice(0, 3).join(".") + ".*";
}

async function getSalt(token) {
  const rows = await runSql(
    token,
    "select value from public.app_secrets where key = 'visit_ip_salt';"
  );
  const v = Array.isArray(rows) && rows[0] ? rows[0].value : null;
  if (!v) throw new Error("数据库缺少 visit_ip_salt，无法生成来源指纹");
  return v;
}

/* ---------- main ---------- */
const fmtBj = (utc) =>
  new Date(utc.endsWith("Z") ? utc : utc + "Z").toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", hour12: false,
  });

(async () => {
  const token = getToken();
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

  console.log(`窗口(UTC): ${iso(start)} → ${iso(end)}`);
  console.log(`模式: ${DRY_RUN ? "dry-run（不写库）" : "正式"}\n`);

  const salt = await getSalt(token);
  const rows = await readLogs(token, SESSION_SQL, iso(start), iso(end));
  console.log(`日志查询成功：返回 ${rows.length} 行会话\n`);

  // 原始 IP 只在内存里参与分组，落盘和入库前一律换成指纹 + 网段
  const safeRows = rows.map(({ ip, ...rest }) => ({
    ...rest,
    ip_hash: ipHash(ip, salt),
    ip_prefix: ipPrefix(ip),
  }));

  // 落盘存档（保险：即使写库失败，数据也不丢）—— 已脱敏，不含原始地址
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const rawFile = path.join(RAW_DIR, `${stamp}.json`);
  fs.writeFileSync(
    rawFile,
    JSON.stringify({
      captured_at: new Date().toISOString(),
      window: { start: iso(start), end: iso(end) },
      note: "IP 已脱敏：仅保留加盐指纹与网段，不含原始地址",
      rows: safeRows,
    }, null, 2),
    "utf8"
  );
  console.log(`脱敏结果已存档: ${rawFile}\n`);

  if (rows.length === 0) {
    console.log("过去 24 小时无任何会话记录（含脚本/爬虫）。");
    return;
  }

  const values = safeRows.map((r) => {
    const startedAt = `${r.started_at}Z`;
    const endedAt = `${r.ended_at}Z`;
    return `(${[
      q(r.day),
      q(startedAt),
      q(endedAt),
      q(r.ip_hash),
      q(r.ip_prefix),
      q(r.channel),
      Number(r.req_count) || 0,
      q(r.pages),
      r.referer ? q(r.referer) : "null",
      q(r.ua_sample),
      r.channel === "爬虫" ? "true" : "false",
    ].join(", ")})`;
  });

  if (DRY_RUN) {
    console.log("--dry-run，未写库。以下是将要插入的 SQL：\n");
    console.log(
      `insert into public.visit_sessions (day, started_at, ended_at, ip_hash, ip_prefix, channel, req_count, pages, referer, ua_sample, is_bot) values\n  ${values.join(",\n  ")}\non conflict (day, ip_hash, started_at) do nothing;`
    );
    return;
  }

  // RETURNING 只返回真正插入的行 → 用它能算出跳过数
  const insertSql =
    `insert into public.visit_sessions (day, started_at, ended_at, ip_hash, ip_prefix, channel, req_count, pages, referer, ua_sample, is_bot) values\n  ` +
    values.join(",\n  ") +
    `\non conflict (day, ip_hash, started_at) do nothing\nreturning day, started_at, ip_hash;`;

  const inserted = await runSql(token, insertSql);
  const insertedCount = Array.isArray(inserted) ? inserted.length : 0;
  const skipped = rows.length - insertedCount;

  console.log(`写入 ${insertedCount} 条，跳过 ${skipped} 条（冲突键已存在）\n`);

  // 保留期：只留最近 180 天（无 pg_cron，顺带在每日任务里清）
  try {
    const purged = await runSql(token, "select public.purge_visit_sessions(180) as n;");
    const n = Array.isArray(purged) && purged[0] ? Number(purged[0].n) || 0 : 0;
    if (n > 0) console.log(`保留期清理：删除 ${n} 条超过 180 天的记录\n`);
  } catch (e) {
    console.warn(`保留期清理失败（不影响本次写入）: ${e.message}\n`);
  }

  /* ---------- 回报真实访客 ---------- */
  const real = safeRows
    .filter((r) => !["脚本", "爬虫"].includes(r.channel))
    .sort((a, b) => (a.started_at < b.started_at ? -1 : 1));

  if (real.length === 0) {
    console.log("过去 24 小时无真实访客。");
    return;
  }

  console.log(`过去 24 小时真实访客会话数：${real.length}`);
  for (const r of real) {
    const fp = r.ip_hash ? String(r.ip_hash).slice(0, 8) : "--------";
    console.log(
      `  · ${fmtBj(r.started_at)} (北京时间) | ${r.channel} | ${r.ip_prefix || "未知网段"} · 指纹 ${fp} | ${r.req_count} 次请求\n    页面: ${r.pages}`
    );
  }
})().catch((e) => {
  console.error("❌ 执行失败:", e.message);
  process.exit(1);
});
