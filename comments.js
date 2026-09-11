/* ==========================================================================
   comments.js · 站点评论 / 留言墙
   后端：Supabase（见 sb.js）。访客用站内账号（昵称 + 密码）登录后即可发言，
   不需要 GitHub，也不需要邮箱。

   用法：
     线程式评论（文章、画廊）
       <div class="comment-host" data-term="article-12"></div>
     便签墙（留言墙）
       <div class="comment-host" data-term="wall" data-kind="wall"></div>
     动态挂载
       window._mountComments('#commentHost')

   安全说明：昵称由数据库在写入时盖章，前端无法冒用他人身份；
   删除请求由服务端校验归属，只能删自己发的。
   ========================================================================== */
(function () {
  'use strict';

  if (!window.SB) { console.warn('comments.js 需要先加载 sb.js'); return; }

  var ITEM = 'id,nickname,body,parent_id,likes,created_at,user_id';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 纯文本 → 安全 HTML：转义后换行成段，自动识别链接
  function rich(s) {
    var out = esc(s)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
    return out.replace(/\n/g, '<br>');
  }

  function fmtTime(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var d = Date.now() - t;
    if (d < 0) d = 0;
    var min = Math.floor(d / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + ' 小时前';
    var day = Math.floor(hr / 24);
    if (day === 1) return '昨天';
    if (day < 30) return day + ' 天前';
    var dt = new Date(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }

  function mine(row) {
    return !!(SB.user && row.user_id && row.user_id === SB.user.id);
  }

  function likedKey(id) { return 'cmt_liked_' + id; }
  function isLiked(id) {
    try { return localStorage.getItem(likedKey(id)) === '1'; } catch (e) { return false; }
  }
  function markLiked(id) {
    try { localStorage.setItem(likedKey(id), '1'); } catch (e) {}
  }

  function errText(e) {
    var m = (e && e.message) || '';
    if (/请先登录/.test(m)) return '登录状态已失效，请重新登录。';
    if (/提交过于频繁/.test(m)) return '发得太快了，歇一分钟再来。';
    if (/row-level security|violates row-level/i.test(m)) return '没有权限执行这个操作。';
    if (/failed to fetch|networkerror|load failed/i.test(m)) return '网络不通，稍后再试。';
    return m || '出了点问题，稍后再试。';
  }

  // ============================================================ 通用外壳

  function mount(host) {
    if (host.getAttribute('data-mounted')) return;
    host.setAttribute('data-mounted', '1');

    var term = host.getAttribute('data-term') || location.pathname;
    var kind = host.getAttribute('data-kind') === 'wall' ? 'wall' : 'thread';

    var state = {
      host: host, term: term, kind: kind,
      rows: [], openReply: null, loading: true, error: ''
    };

    host.innerHTML = '<div class="cmt-root"></div>';
    var root = host.querySelector('.cmt-root');

    function render() {
      root.innerHTML = state.kind === 'wall' ? wallHtml(state) : threadHtml(state);
      bind(root, state, render, load);
    }

    function load() {
      state.loading = true;
      state.error = '';
      render();

      var p = state.kind === 'wall'
        ? SB.select('notes', SB.q({
            select: 'id,nickname,body,created_at,user_id',
            order: 'created_at.desc', limit: '300'
          }))
        : SB.select('comments', SB.q({
            path: 'eq.' + state.term,
            select: ITEM,
            order: 'created_at.asc',
            limit: '500'
          }));

      p.then(function (rows) {
        state.rows = rows || [];
        state.loading = false;
        render();
      }).catch(function (e) {
        state.loading = false;
        state.error = errText(e);
        render();
      });
    }

    host._czhReload = load;
    render();
    load();
  }

  // ============================================================ 线程式评论

  function threadHtml(state) {
    var rows = state.rows;
    var tops = rows.filter(function (r) { return !r.parent_id; });
    var repliesOf = {};
    rows.forEach(function (r) {
      if (r.parent_id) (repliesOf[r.parent_id] = repliesOf[r.parent_id] || []).push(r);
    });

    var byId = {};
    rows.forEach(function (r) { byId[r.id] = r; });

    return '' +
      '<div class="cmt-summary">' + (rows.length ? '共 ' + rows.length + ' 条评论' : '还没有人说话') + '</div>' +
      composerHtml(state, 'thread') +
      (state.loading ? '<div class="comments-loading"><div class="loading-spinner"></div>加载中…</div>' :
        state.error ? '<div class="comments-error">' + esc(state.error) + '</div>' :
        (!rows.length ? '<div class="comments-empty">空着也是空着，说点什么吧</div>' :
          tops.map(function (c) {
            var kids = repliesOf[c.id] || [];
            return commentHtml(c, kids, byId, state);
          }).join('')));
  }

  function commentHtml(c, kids, byId, state) {
    var own = mine(c);
    return '' +
      '<div class="comment-item" data-id="' + c.id + '">' +
        '<div class="comment-header">' +
          avatarHtml(c.nickname) +
          '<div>' +
            '<span class="comment-author-name">' + esc(c.nickname) + (own ? '<span class="cmt-you">我</span>' : '') + '</span>' +
            '<span class="comment-time">' + esc(fmtTime(c.created_at)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="comment-body">' + rich(c.body) + '</div>' +
        '<div class="comment-actions">' +
          '<button type="button" class="comment-action-btn' + (isLiked(c.id) ? ' liked' : '') + '" data-act="like" data-id="' + c.id + '">' +
            (isLiked(c.id) ? '♥' : '♡') + ' ' + (c.likes || 0) +
          '</button>' +
          '<button type="button" class="comment-action-btn" data-act="reply" data-id="' + c.id + '" data-name="' + esc(c.nickname) + '">回复</button>' +
          (own ? '<button type="button" class="comment-action-btn" data-act="del" data-id="' + c.id + '">删除</button>' : '') +
        '</div>' +
        (kids.length ? '<div class="comment-replies">' + kids.map(function (k) {
          var kOwn = mine(k);
          return '<div class="comment-reply-item" data-id="' + k.id + '">' +
            avatarHtml(k.nickname, true) +
            '<div class="comment-reply-content">' +
              '<span class="comment-author-name">' + esc(k.nickname) + '</span>' +
              '<div class="comment-body">' + rich(k.body) + '</div>' +
              '<div class="comment-reply-actions-inline">' +
                '<span class="comment-time">' + esc(fmtTime(k.created_at)) + '</span>' +
                (kOwn ? '<button type="button" class="comment-action-btn" data-act="del" data-id="' + k.id + '">删除</button>' : '') +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>' : '') +
        (state.openReply === c.id ? replyFormHtml(c) : '') +
      '</div>';
  }

  function replyFormHtml(c) {
    return '' +
      '<div class="comment-reply-form">' +
        '<textarea class="comment-input comment-input-sm" data-role="reply-box" data-parent="' + c.id + '" ' +
          'placeholder="回复 ' + esc(c.nickname) + '…" maxlength="2000"></textarea>' +
        '<p class="comment-error" data-role="err" style="display:none"></p>' +
        '<div class="comment-reply-actions-inline">' +
          '<button type="button" class="comment-submit-btn comment-submit-sm" data-act="send-reply" data-parent="' + c.id + '">发送</button>' +
          '<button type="button" class="comment-action-btn" data-act="cancel-reply">取消</button>' +
        '</div>' +
      '</div>';
  }

  function composerHtml(state, kind) {
    if (!SB.loggedIn) {
      return '' +
        '<div class="comment-form-wrap cmt-gate">' +
          '<p class="cmt-gate-title">登录后就能评论</p>' +
          '<p class="cmt-gate-sub">用昵称注册一个站内账号即可，不用邮箱，也不用 GitHub。</p>' +
          '<button type="button" class="comment-submit-btn" data-act="login">登录 / 注册</button>' +
        '</div>';
    }
    return '' +
      '<div class="comment-form-wrap">' +
        '<div class="comment-form-row">' +
          '<textarea class="comment-input" data-role="box" maxlength="2000" ' +
            'placeholder="' + (kind === 'wall' ? '贴一张便签…' : '说点什么…') + '"></textarea>' +
        '</div>' +
        '<p class="comment-error" data-role="err" style="display:none"></p>' +
        '<div class="comment-form-footer">' +
          '<span class="comment-md-hint">以 <b>' + esc(SB.nickname || '') + '</b> 的身份发言</span>' +
          '<button type="button" class="comment-submit-btn" data-act="send">发表</button>' +
        '</div>' +
      '</div>';
  }

  function avatarHtml(name, small) {
    var ch = (name || '?').trim()[0] || '?';
    return '<span class="comment-avatar-icon' + (small ? ' comment-avatar-sm' : '') + '">' + esc(ch) + '</span>';
  }

  // ============================================================ 便签墙

  function wallHtml(state) {
    var rows = state.rows;
    return '' +
      '<div class="cmt-summary">' + (rows.length ? '墙上贴着 ' + rows.length + ' 张便签' : '墙上还是空的') + '</div>' +
      composerHtml(state, 'wall') +
      (state.loading ? '<div class="comments-loading"><div class="loading-spinner"></div>加载中…</div>' :
        state.error ? '<div class="comments-error">' + esc(state.error) + '</div>' :
        (!rows.length ? '<div class="comments-empty">来贴第一张吧</div>' :
          '<div class="wall-notes">' + rows.map(function (n, i) {
            var own = mine(n);
            return '<div class="wall-note wall-tone-' + (i % 4) + '" data-id="' + n.id + '">' +
              '<div class="wall-note-body">' + rich(n.body) + '</div>' +
              '<div class="wall-note-foot">' +
                '<span class="wall-note-name">' + esc(n.nickname) + '</span>' +
                '<span class="comment-time">' + esc(fmtTime(n.created_at)) + '</span>' +
                (own ? '<button type="button" class="comment-action-btn" data-act="del-note" data-id="' + n.id + '">撕掉</button>' : '') +
              '</div>' +
            '</div>';
          }).join('') + '</div>'));
  }

  // ============================================================ 交互绑定

  function bind(root, state, render, load) {
    function showErr(msg) {
      var el = root.querySelector('[data-role="err"]');
      if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    root.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      var id = t.getAttribute('data-id');

      if (act === 'login') {
        if (window._siteRequireLogin) window._siteRequireLogin().then(function () { load(); });
        return;
      }

      if (act === 'reply') {
        state.openReply = (state.openReply === Number(id)) ? null : Number(id);
        render();
        var box = root.querySelector('[data-role="reply-box"]');
        if (box) { box.focus(); box.selectionStart = box.value.length; }
        return;
      }

      if (act === 'cancel-reply') { state.openReply = null; render(); return; }

      if (act === 'like') {
        if (isLiked(id)) return;
        t.disabled = true;
        SB.rpc('like_comment', { p_id: Number(id) }).then(function (n) {
          markLiked(id);
          var row = state.rows.filter(function (r) { return String(r.id) === String(id); })[0];
          if (row) row.likes = (typeof n === 'number' ? n : (row.likes || 0) + 1);
          render();
        }).catch(function () { t.disabled = false; });
        return;
      }

      if (act === 'send') {
        var box = root.querySelector('[data-role="box"]');
        var body = box ? box.value.trim() : '';
        if (!body) { showErr('还没写内容'); return; }
        t.disabled = true;
        t.textContent = '发表中…';
        var table = state.kind === 'wall' ? 'notes' : 'comments';
        var row = state.kind === 'wall' ? { body: body } : { path: state.term, body: body };
        SB.insert(table, row).then(function () {
          if (box) box.value = '';
          return load();
        }).catch(function (err) {
          t.disabled = false;
          t.textContent = '发表';
          showErr(errText(err));
        });
        return;
      }

      if (act === 'send-reply') {
        var rbox = root.querySelector('[data-role="reply-box"]');
        var rbody = rbox ? rbox.value.trim() : '';
        if (!rbody) { showErr('还没写内容'); return; }
        t.disabled = true;
        t.textContent = '发送中…';
        SB.insert('comments', { path: state.term, body: rbody, parent_id: Number(t.getAttribute('data-parent')) })
          .then(function () {
            state.openReply = null;
            return load();
          }).catch(function (err) {
            t.disabled = false;
            t.textContent = '发送';
            showErr(errText(err));
          });
        return;
      }

      if (act === 'del' || act === 'del-note') {
        var table = act === 'del-note' ? 'notes' : 'comments';
        var msg = act === 'del-note' ? '撕掉这张便签？' : '删除这条评论？';
        confirmThen(msg, function () {
          SB.remove(table, Number(id)).then(function () { load(); })
            .catch(function (err) { showErr(errText(err)); });
        });
        return;
      }
    });

    // 回复框里的 Ctrl+Enter / Cmd+Enter 直接发送
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        var el = e.target;
        if (!el || !el.getAttribute) return;
        var role = el.getAttribute('data-role');
        if (role === 'box') {
          var b = root.querySelector('[data-act="send"]');
          if (b) b.click();
        } else if (role === 'reply-box') {
          var rb = root.querySelector('[data-act="send-reply"]');
          if (rb) rb.click();
        }
      }
    });
  }

  // 复用站点的确认弹窗；没有就退回原生 confirm
  function confirmThen(msg, onOk) {
    if (typeof window._showConfirm === 'function') window._showConfirm(msg, onOk);
    else if (window.confirm(msg)) onOk();
  }

  // ============================================================ 启动

  var SELECTOR = '.comment-host';

  function all(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel || SELECTOR));
  }

  function boot() { all().forEach(mount); }

  window._mountComments = function (sel) {
    var nodes = sel ? all(sel) : all();
    nodes.forEach(mount);
  };
  window._refreshComments = function (sel) {
    (sel ? all(sel) : all()).forEach(function (h) {
      if (h._czhReload) h._czhReload();
    });
  };

  // 登录 / 退出后，重新渲染输入区（不必重新拉数据）
  SB.onChange(function () {
    document.querySelectorAll('.cmt-root').forEach(function (r) {
      var box = r.querySelector('[data-role="box"]');
      if (box) box.removeAttribute('data-dirty');
    });
    all().forEach(function (h) {
      if (h.getAttribute('data-mounted')) {
        h.removeAttribute('data-mounted');
        mount(h);
      }
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
