/* ==========================================================================
   sb.js · 站点后端客户端（Supabase）
   零第三方依赖：自己拼 REST 请求，不加载任何 CDN 脚本，国内访问更稳。

   账号模型：昵称 + 密码
     Supabase Auth 只认邮箱，所以由昵称「确定性推导」出一个邮箱地址：
       u<sha256(小写昵称)前32位>@qq.com
     同一昵称永远得到同一地址，因此可以只用昵称登录；
     域名必须是有 MX 记录的真实域名（Supabase 会校验域名有效性）。
     注册后无需收邮件——前提是后台关掉「Confirm email」。

   对外接口：window.SB
     SB.ready                     会话就绪的 Promise
     SB.user                      当前用户 {id, email} 或 null（同步可读）
     SB.nickname                  当前昵称（先读缓存，就绪后校正确认）
     SB.onChange(fn)              登录状态变化回调
     SB.auth.signUp(name, pwd)    注册（自动登录）
     SB.auth.signIn(name, pwd)    登录
     SB.auth.signOut()            退出
     SB.auth.nicknameTaken(name)  昵称是否已被占用
     SB.select(table, query)      查询
     SB.insert(table, row)        新增
     SB.remove(table, id)         删除（服务端只允许删自己的）
     SB.removeContent(table, id)  删文章/帖子（连带清掉它的评论，仅限本人）
     SB.rpc(fn, args)             调用数据库函数
     SB.upload(bucket, path, file) 上传文件
     SB.publicUrl(bucket, path)   取公开地址
     SB.q({...})                  构造查询串
   ========================================================================== */
(function () {
  'use strict';

  var BASE = 'https://euhdfzgxxzavwqsgxmoy.supabase.co';
  var KEY = 'sb_publishable_4EDjvJ2reBlrAx_6skSrfw_aQHNgAm8';
  var SK = 'czh_session';
  var MAIL_DOMAIN = 'qq.com';

  // ---------------------------------------------------------------- 会话

  var session = null;
  try { session = JSON.parse(localStorage.getItem(SK) || 'null'); } catch (e) { session = null; }
  if (session && !session.access_token) session = null;

  var listeners = [];

  // 服务端 profiles 里盖章后的真实昵称：注册时若与他人重名，数据库会自动加后缀，
  // 因此就绪后要以服务端为准，覆盖本地缓存里的那一个。
  var dbNick = null;

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](SB.user); } catch (e) {}
    }
  }

  function save(s) {
    session = s || null;
    dbNick = (session && session.user && session.user.nickname) || null;
    try {
      if (session) localStorage.setItem(SK, JSON.stringify(session));
      else localStorage.removeItem(SK);
    } catch (e) {}
    notify();
  }

  function norm(d) {
    if (!d || !d.access_token) return null;
    return {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      // 提前 2 分钟当作过期，避免请求正好卡在过期瞬间
      expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)),
      user: d.user || (session && session.user) || null
    };
  }

  var refreshing = null;

  // 过期则续期；续期失败则视为已退出
  function fresh() {
    if (!session) return Promise.resolve(null);
    var left = session.expires_at * 1000 - Date.now();
    if (left > 120000) return Promise.resolve(session);
    if (!session.refresh_token) { save(null); return Promise.resolve(null); }
    if (refreshing) return refreshing;
    refreshing = request('POST', '/auth/v1/token?grant_type=refresh_token',
      { refresh_token: session.refresh_token }, { auth: false })
      .then(function (d) { save(norm(d)); return session; })
      .catch(function () { save(null); return null; })
      .then(function (r) { refreshing = null; return r; });
    return refreshing;
  }

  // ---------------------------------------------------------------- 请求

  function request(method, path, body, opt) {
    opt = opt || {};
    var headers = { 'apikey': KEY };
    var hasBody = body !== undefined && body !== null;
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (opt.auth !== false && session && session.access_token) {
      headers['Authorization'] = 'Bearer ' + session.access_token;
    }
    if (opt.headers) {
      for (var k in opt.headers) if (opt.headers.hasOwnProperty(k)) headers[k] = opt.headers[k];
    }
    // 加超时：国内直连 supabase 偶尔会挂住迟迟不返回，
    // 没有这道闸请求会一直悬着，界面就停在「加载中…」。
    var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var aborted = false;
    var timer = ac ? setTimeout(function () { aborted = true; ac.abort(); }, opt.timeout || 20000) : null;
    function cleanup() { if (timer) { clearTimeout(timer); timer = null; } }

    var done = fetch(BASE + path, {
      method: method,
      headers: headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: ac ? ac.signal : undefined
    }).then(function (r) {
      if (r.status === 401 && opt.auth !== false && session) {
        // 令牌失效（可能是服务端重置了）：清掉本地会话，提示重新登录
        save(null);
      }
      if (r.status === 204) return null;
      return r.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!r.ok) {
          var msg = (d && (d.msg || d.message || d.error_description || d.error || d.hint)) ||
            ('请求失败（' + r.status + '）');
          var err = new Error(msg);
          err.status = r.status;
          err.code = d && d.error_code;
          err.data = d;
          throw err;
        }
        return d;
      });
    });

    return done.then(function (v) { cleanup(); return v; }, function (e) {
      cleanup();
      if (aborted) {
        var err = new Error('请求超时');
        err.code = 'timeout';
        throw err;
      }
      throw e;
    });
  }

  // 构造 PostgREST 查询串：SB.q({ path: 'eq.article-1', select: '*', order: 'created_at.asc' })
  function q(params) {
    var parts = [];
    for (var k in params) {
      if (!params.hasOwnProperty(k)) continue;
      var v = params[k];
      if (v === undefined || v === null || v === '') continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    return parts.join('&');
  }

  // 表名白名单，避免拼接出意外路径
  // score_board 是聚合视图（只读）；visit_sessions 是访问快照，RLS 只放行站长
  var TABLES = { comments: 1, notes: 1, posts: 1, articles: 1, scores: 1, photos: 1, profiles: 1, score_board: 1, visit_sessions: 1 };

  function table(name) {
    if (!TABLES[name]) throw new Error('未知数据表：' + name);
    return name;
  }

  // ---------------------------------------------------------------- 账号

  // 昵称规范化：去首尾空白、合并连续空格、转小写、Unicode NFC
  function normalize(name) {
    var s = String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
    if (s.normalize) s = s.normalize('NFC');
    return s.toLowerCase();
  }

  function fnv32(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  // 昵称 → 稳定的 32 位十六进制串（用作邮箱本地部分）
  function fingerprint(name) {
    var s = normalize(name);
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      var buf = new TextEncoder().encode(s);
      return window.crypto.subtle.digest('SHA-256', buf).then(function (d) {
        var a = new Uint8Array(d), out = '';
        for (var i = 0; i < 16; i++) out += ('0' + a[i].toString(16)).slice(-2);
        return out;
      }).catch(function () { return fallbackFp(s); });
    }
    return Promise.resolve(fallbackFp(s));
  }

  // 非安全上下文（http / file://）没有 crypto.subtle，退回 FNV 拼接
  function fallbackFp(s) {
    return fnv32(s) + fnv32(s + '|1') + fnv32(s + '|2') + fnv32(s + '|3');
  }

  function emailFor(name) {
    return fingerprint(name).then(function (fp) { return 'u' + fp + '@' + MAIL_DOMAIN; });
  }

  function metaFrom(d) {
    // 把用户信息补到会话里，便于随时读取昵称
    if (d && d.user) {
      d.user = { id: d.user.id, email: d.user.email, nickname: (d.user.user_metadata && d.user.user_metadata.nickname) || '' };
    }
    return d;
  }

  function signUp(name, pwd) {
    return emailFor(name).then(function (email) {
      return request('POST', '/auth/v1/signup', {
        email: email,
        password: pwd,
        data: { nickname: String(name).trim().replace(/\s+/g, ' ') }
      }, { auth: false });
    }).then(function (d) {
      d = metaFrom(d);
      var s = norm(d);
      if (!s) {
        // 走到了这里说明后台还开着「Confirm email」，注册会被邮件验证卡住
        var e = new Error('站点后台尚未关闭邮箱验证，暂时无法注册。请联系站长。');
        e.code = 'confirm_email_on';
        throw e;
      }
      save(s);
      return s;
    });
  }

  function signIn(name, pwd) {
    return emailFor(name).then(function (email) {
      return request('POST', '/auth/v1/token?grant_type=password', {
        email: email, password: pwd
      }, { auth: false });
    }).then(function (d) {
      d = metaFrom(d);
      var s = norm(d);
      save(s);
      return s;
    });
  }

  function signOut() {
    var t = session && session.access_token;
    save(null);
    if (!t) return Promise.resolve();
    return fetch(BASE + '/auth/v1/logout', {
      method: 'POST', headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + t }
    }).catch(function () {});
  }

  // 昵称是否已被占用（个人站点用户量小，直接拉列表比对，避免转义踩坑）
  function nicknameTaken(name) {
    var want = normalize(name);
    return request('GET', '/rest/v1/profiles?' + q({
      select: 'nickname', limit: '5000'
    }), undefined, { auth: false }).then(function (rows) {
      if (!rows) return false;
      for (var i = 0; i < rows.length; i++) {
        if (normalize(rows[i].nickname) === want) return true;
      }
      return false;
    }).catch(function () { return null; });
  }

  // 当前用户资料（昵称以服务端为准，可能与注册时填的有细微差别）
  function profile() {
    if (!session || !session.user) return Promise.resolve(null);
    return request('GET', '/rest/v1/profiles?' + q({
      select: 'nickname', id: 'eq.' + session.user.id, limit: '1'
    })).then(function (rows) { return rows && rows[0] ? rows[0] : null; })
      .catch(function () { return null; });
  }

  // ---------------------------------------------------------------- 数据

  function select(t, query) {
    return fresh().then(function () {
      return request('GET', '/rest/v1/' + table(t) + (query ? '?' + query : ''));
    });
  }

  function insert(t, row) {
    return fresh().then(function () {
      return request('POST', '/rest/v1/' + table(t), row,
        { headers: { 'Prefer': 'return=representation' } });
    });
  }

  function update(t, query, patch) {
    return fresh().then(function () {
      return request('PATCH', '/rest/v1/' + table(t) + (query ? '?' + query : ''), patch,
        { headers: { 'Prefer': 'return=representation' } });
    });
  }

  function remove(t, id) {
    return fresh().then(function () {
      return request('DELETE', '/rest/v1/' + table(t) + '?' + q({ id: 'eq.' + id }));
    });
  }

  function rpc(fn, args) {
    return fresh().then(function () {
      return request('POST', '/rest/v1/rpc/' + fn, args || {});
    });
  }

  // 删文章 / 帖子。
  // 优先走服务端的级联删除：由数据库确认这条确实属于你，再连同它下面的
  // 评论一起清掉，不留孤儿数据。只有本人能删，这一点由函数内部把关。
  // 万一数据库里还没装那两个函数（404），退回普通删除 —— 删不掉评论，
  // 但删除功能本身不会瘫。
  function removeContent(t, id) {
    var fn = t === 'articles' ? 'delete_article' : 'delete_post';
    return rpc(fn, { p_id: Number(id) }).then(function (done) {
      if (done === false) {
        // 服务端筛不到属于你的这一行：要么不是你的，要么已经被删了
        var e = new Error('这条内容不属于你，删不掉');
        e.code = 'not_owner';
        throw e;
      }
      return true;
    }).catch(function (e) {
      if (e && e.status === 404) {
        return remove(t, id).then(function () { return true; });
      }
      throw e;
    });
  }

  // ---------------------------------------------------------------- 存储

  function upload(bucket, path, file, contentType) {
    return fresh().then(function () {
      var headers = {
        'apikey': KEY,
        'Content-Type': contentType || file.type || 'application/octet-stream',
        'x-upsert': 'false'
      };
      if (session) headers['Authorization'] = 'Bearer ' + session.access_token;
      return fetch(BASE + '/storage/v1/object/' + bucket + '/' + path, {
        method: 'POST', headers: headers, body: file
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            var e = new Error('上传失败（' + r.status + '）：' + t.slice(0, 160));
            e.status = r.status;
            throw e;
          });
        }
        return { path: path, url: publicUrl(bucket, path) };
      });
    });
  }

  function publicUrl(bucket, path) {
    return BASE + '/storage/v1/object/public/' + bucket + '/' + path;
  }

  // 删除 Storage 里的文件（策略只允许删自己目录下的）
  function removeStorage(bucket, path) {
    return fresh().then(function () {
      var headers = { 'apikey': KEY };
      if (session) headers['Authorization'] = 'Bearer ' + session.access_token;
      return fetch(BASE + '/storage/v1/object/' + bucket + '/' + path, {
        method: 'DELETE', headers: headers
      }).then(function (r) {
        if (!r.ok && r.status !== 404) {
          return r.text().then(function (t) {
            var e = new Error('删除失败（' + r.status + '）：' + t.slice(0, 160));
            e.status = r.status;
            throw e;
          });
        }
        return true;
      });
    });
  }

  // ---------------------------------------------------------------- 导出

  var SB = {
    url: BASE,
    key: KEY,
    get user() { return session ? session.user : null; },
    get loggedIn() { return !!(session && session.access_token); },
    // 当前昵称：优先用服务端校正过的，其次用会话里带的，未登录返回空串
    get nickname() {
      if (dbNick) return dbNick;
      return (session && session.user && session.user.nickname) || '';
    },
    q: q,
    select: select,
    insert: insert,
    update: update,
    remove: remove,
    removeContent: removeContent,
    rpc: rpc,
    upload: upload,
    publicUrl: publicUrl,
    removeStorage: removeStorage,
    normalize: normalize,
    onChange: function (fn) {
      if (typeof fn === 'function') { listeners.push(fn); fn(SB.user); }
    },
    auth: {
      signUp: signUp,
      signIn: signIn,
      signOut: signOut,
      nicknameTaken: nicknameTaken,
      profile: profile
    },
    // 就绪：若有会话则顺手续期一次，静默失败不影响页面
    ready: null
  };

  SB.ready = (session ? fresh().catch(function () { return null; }) : Promise.resolve(null))
    .then(function () {
      if (!session) return null;
      // 用服务端资料校正昵称，纠正本地缓存的偏差
      return profile().then(function (p) {
        if (p && p.nickname && p.nickname !== dbNick) {
          dbNick = p.nickname;
          if (session.user) session.user.nickname = p.nickname;
          try { localStorage.setItem(SK, JSON.stringify(session)); } catch (e) {}
          notify();
        }
        return session;
      });
    });

  window.SB = SB;
})();
