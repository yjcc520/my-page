/* ==========================================================================
   chat.js · 跟小新聊天
   AI 由服务端（Supabase 函数 shinchan_chat）代调，密钥不出现在这里。

   对外接口：
     window.ShinchanChat.open()     打开聊天框
     window.ShinchanChat.close()    关掉
     window.ShinchanChat.isOpen()   是否开着
   ========================================================================== */
(function () {
  'use strict';

  var el = null;        // 外层
  var bodyEl = null;    // 消息区
  var inputEl = null;
  var sendBtn = null;
  var busy = false;
  var greeted = false;

  /* ---------------------------------------------------------------- 样式 */

  var CSS = [
    '.sc-mask{position:fixed;inset:0;background:rgba(24,32,44,.42);z-index:180;opacity:0;pointer-events:none;transition:opacity .28s}',
    '.sc-mask.on{opacity:1;pointer-events:auto}',
    '.sc-box{position:fixed;z-index:181;right:clamp(12px,2vw,28px);bottom:clamp(12px,2vw,28px);',
    '  width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 40px));',
    '  display:flex;flex-direction:column;overflow:hidden;',
    '  background:var(--bg);border:1px solid var(--border);border-radius:16px;',
    '  box-shadow:0 24px 60px rgba(24,32,44,.34);',
    '  transform:translateY(18px) scale(.96);opacity:0;pointer-events:none;',
    '  transition:transform .3s cubic-bezier(.18,.89,.32,1.28),opacity .24s}',
    '.sc-box.on{transform:none;opacity:1;pointer-events:auto}',

    '.sc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;',
    '  background:linear-gradient(135deg,var(--primary),#3a5670);color:#fff;flex:0 0 auto}',
    '.sc-head img{width:38px;height:38px;border-radius:11px;object-fit:cover;',
    '  border:1.5px solid rgba(255,255,255,.6)}',
    '.sc-name{font-weight:700;font-size:.95rem;line-height:1.25}',
    '.sc-sub{font-size:.7rem;opacity:.82;line-height:1.3}',
    '.sc-x{margin-left:auto;background:none;border:none;color:#fff;font-size:1.3rem;',
    '  cursor:pointer;line-height:1;padding:4px 6px;border-radius:6px;opacity:.85}',
    '.sc-x:hover{background:rgba(255,255,255,.18);opacity:1}',

    '.sc-body{flex:1 1 auto;overflow-y:auto;padding:14px 12px;display:flex;',
    '  flex-direction:column;gap:10px;background:var(--bg-alt)}',
    '.sc-row{display:flex;gap:7px;max-width:100%}',
    '.sc-row.me{flex-direction:row-reverse}',
    '.sc-av{width:28px;height:28px;border-radius:9px;flex:0 0 auto;object-fit:cover;align-self:flex-end}',
    '.sc-bub{max-width:76%;padding:8px 12px;border-radius:14px;font-size:.86rem;',
    '  line-height:1.65;white-space:pre-wrap;word-break:break-word}',
    '.sc-row.me .sc-bub{background:var(--primary);color:#fff;border-bottom-right-radius:5px}',
    '.sc-row.him .sc-bub{background:var(--bg);border:1px solid var(--border);',
    '  color:var(--text);border-bottom-left-radius:5px}',

    '.sc-dots span{display:inline-block;width:6px;height:6px;margin-right:3px;border-radius:50%;',
    '  background:var(--text-light);opacity:.5;animation:scBlink 1.1s infinite}',
    '.sc-dots span:nth-child(2){animation-delay:.18s}',
    '.sc-dots span:nth-child(3){animation-delay:.36s}',
    '@keyframes scBlink{0%,60%,100%{opacity:.28;transform:translateY(0)}30%{opacity:.9;transform:translateY(-3px)}}',

    '.sc-tip{text-align:center;font-size:.7rem;color:var(--text-light);padding:9px 14px;',
    '  line-height:1.6;background:var(--bg-alt);border-top:1px solid var(--border)}',

    '.sc-foot{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px;',
    '  border-top:1px solid var(--border);background:var(--bg);align-items:flex-end}',
    '.sc-in{flex:1 1 auto;resize:none;border:1px solid var(--border);border-radius:11px;',
    '  padding:9px 11px;font-size:.87rem;font-family:inherit;line-height:1.5;',
    '  background:var(--bg-alt);color:var(--text);max-height:96px;min-height:40px}',
    '.sc-in:focus{outline:none;border-color:var(--primary)}',
    '.sc-send{flex:0 0 auto;width:40px;height:40px;border:none;border-radius:11px;cursor:pointer;',
    '  background:linear-gradient(135deg,var(--primary),#3a5670);color:#fff;font-size:1rem;',
    '  transition:transform .15s,opacity .15s}',
    '.sc-send:hover:not(:disabled){transform:translateY(-1px)}',
    '.sc-send:disabled{opacity:.42;cursor:not-allowed}',

    '@media (max-width:520px){',
    '  .sc-box{right:8px;left:8px;bottom:8px;width:auto;height:min(72vh,540px);border-radius:14px}',
    '  .sc-body{padding:12px 9px}',
    '  .sc-bub{font-size:.84rem;max-width:80%}',
    '}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('scStyle')) return;
    var s = document.createElement('style');
    s.id = 'scStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------ 工具函数 */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 小新头像：复用悬浮吉祥物那张图
  function avatarUrl() {
    var img = document.querySelector('.shinchan img');
    return img ? img.getAttribute('src') : 'shinchan.jpg';
  }

  function scrollDown() {
    if (bodyEl) bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function addRow(role, text) {
    var row = document.createElement('div');
    row.className = 'sc-row ' + (role === 'user' ? 'me' : 'him');
    if (role === 'user') {
      row.innerHTML = '<div class="sc-bub">' + esc(text) + '</div>';
    } else {
      row.innerHTML = '<img class="sc-av" src="' + esc(avatarUrl()) + '" alt="">' +
        '<div class="sc-bub">' + esc(text) + '</div>';
    }
    bodyEl.appendChild(row);
    scrollDown();
    return row;
  }

  function addTyping() {
    var row = document.createElement('div');
    row.className = 'sc-row him';
    row.id = 'scTyping';
    row.innerHTML = '<img class="sc-av" src="' + esc(avatarUrl()) + '" alt="">' +
      '<div class="sc-bub sc-dots"><span></span><span></span><span></span></div>';
    bodyEl.appendChild(row);
    scrollDown();
    return row;
  }

  function build() {
    if (el) return;
    injectCss();

    el = document.createElement('div');

    var mask = document.createElement('div');
    mask.className = 'sc-mask';
    mask.id = 'scMask';

    var box = document.createElement('div');
    box.className = 'sc-box';
    box.id = 'scBox';
    box.innerHTML =
      '<div class="sc-head">' +
        '<img src="' + esc(avatarUrl()) + '" alt="">' +
        '<div><div class="sc-name">野原新之助</div>' +
        '<div class="sc-sub">5 岁 · 向日葵班 · 正在偷看你</div></div>' +
        '<button class="sc-x" id="scClose" title="关掉">&times;</button>' +
      '</div>' +
      '<div class="sc-body" id="scBody"></div>' +
      '<div class="sc-tip" id="scTip">小新每天最多聊 30 句，说完就去睡觉了。</div>' +
      '<div class="sc-foot">' +
        '<textarea class="sc-in" id="scIn" rows="1" maxlength="300" ' +
          'placeholder="跟小新说点什么…（Enter 发送）"></textarea>' +
        '<button class="sc-send" id="scSend" title="发送">&#10148;</button>' +
      '</div>';

    el.appendChild(mask);
    el.appendChild(box);
    document.body.appendChild(el);

    bodyEl = box.querySelector('#scBody');
    inputEl = box.querySelector('#scIn');
    sendBtn = box.querySelector('#scSend');

    box.querySelector('#scClose').onclick = api.close;
    mask.onclick = api.close;
    sendBtn.onclick = send;

    inputEl.addEventListener('input', function () {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
    });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && api.isOpen()) api.close();
    });
  }

  /* ---------------------------------------------------------------- 发送 */

  function setBusy(v) {
    busy = v;
    if (sendBtn) sendBtn.disabled = v;
    if (inputEl) inputEl.disabled = v;
  }

  function hint(t) {
    var tip = document.getElementById('scTip');
    if (tip) tip.textContent = t;
  }

  function greet() {
    if (greeted) return;
    greeted = true;
    var nick = (window._siteGetNickname && window._siteGetNickname()) || '';
    var hi = nick
      ? '哎呀，是' + nick + '啊！你怎么又来了，是不是想我了？'
      : '哎呀，你是谁呀？我不认识你哦。';
    addRow('assistant', hi);
  }

  function send() {
    if (busy || !inputEl) return;
    var text = inputEl.value.trim();
    if (!text) return;

    if (!window.SB || !window.SB.rpc) { hint('页面还没准备好，刷新一下再聊。'); return; }
    if (!SB.loggedIn) {
      addRow('assistant', '小新只跟认识的人说话。你右上角登录一下，我就在这里等你。');
      hint('需要先登录，才能跟小新聊天。');
      return;
    }

    addRow('user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    setBusy(true);
    hint('小新正在想…');
    var typing = addTyping();

    SB.rpc('shinchan_chat', { p_message: text }).then(function (res) {
      var t = document.getElementById('scTyping');
      if (t) t.remove();

      // 函数返回 jsonb：{ok, reply} 或 {ok:false, error}
      var d = res;
      if (Array.isArray(d)) d = d[0];
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
      if (d && d.result && typeof d.result === 'object') d = d.result;

      if (d && d.ok && d.reply) {
        addRow('assistant', d.reply);
        hint('小新每天最多聊 30 句，说完就去睡觉了。');
      } else {
        var msg = (d && d.error) || '小新没说话，你再说一遍？';
        addRow('assistant', msg);
        hint(d && d.needLogin ? '需要先登录，才能跟小新聊天。' : '刚刚卡了一下，再试一次吧。');
        if (d && d.detail && window.console) console.warn('[小新]', d.detail);
      }
    }).catch(function (e) {
      var t = document.getElementById('scTyping');
      if (t) t.remove();
      addRow('assistant', '哎呀我掉线了，你再喊我一声。');
      hint('网络不太顺，再试一次吧。');
      if (window.console) console.warn('[小新]', e && e.message);
    }).then(function () {
      setBusy(false);
      if (inputEl) inputEl.focus();
    });
  }

  /* ------------------------------------------------------------ 对外接口 */

  var api = {
    open: function () {
      build();
      var box = document.getElementById('scBox');
      var mask = document.getElementById('scMask');
      if (box) box.classList.add('on');
      if (mask) mask.classList.add('on');
      greet();
      setTimeout(function () { if (inputEl) inputEl.focus(); }, 320);
    },
    close: function () {
      var box = document.getElementById('scBox');
      var mask = document.getElementById('scMask');
      if (box) box.classList.remove('on');
      if (mask) mask.classList.remove('on');
    },
    isOpen: function () {
      var box = document.getElementById('scBox');
      return !!(box && box.classList.contains('on'));
    }
  };

  window.ShinchanChat = api;
})();
