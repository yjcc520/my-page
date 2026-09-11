/* ==========================================================================
   user.js · 站点账号
   账号 = 昵称 + 密码，不需要邮箱、不需要 GitHub。
   后端由 Supabase Auth 承载，会话自动续期，凭据只存在浏览器本地。

   对外接口（与旧版保持一致，页面无需改动）：
     _siteGetNickname()  当前昵称，未登录返回 ''
     _siteGetAvatar()    头像地址（本地保存，不会上传）
     _siteShowRegister() 打开账号面板
     _siteLogout()       退出登录
   新增：
     _siteRequireLogin() 返回 Promise；未登录时弹面板，登录后 resolve 出昵称
     _siteUid()          当前用户 id，未登录返回 ''
   ========================================================================== */
(function () {
  'use strict';

  if (!window.SB) { console.warn('user.js 需要先加载 sb.js'); return; }

  var nickname = '';
  var avatar = '';
  var pending = null;   // _siteRequireLogin 等待中的 resolver

  function uid() { return (SB.user && SB.user.id) || ''; }

  function cacheKey(base) {
    var u = uid();
    return u ? base + '_' + u : '';
  }

  function readCache() {
    var u = SB.user;
    if (!u) { nickname = ''; avatar = ''; return; }
    nickname = u.nickname || '';
    try {
      var k = cacheKey('site_nickname');
      if (!nickname && k) nickname = localStorage.getItem(k) || '';
      var a = cacheKey('site_avatar');
      if (a) avatar = localStorage.getItem(a) || '';
    } catch (e) {}
  }

  function persist() {
    try {
      var nk = cacheKey('site_nickname');
      if (nk && nickname) localStorage.setItem(nk, nickname);
      var ak = cacheKey('site_avatar');
      if (ak) { if (avatar) localStorage.setItem(ak, avatar); else localStorage.removeItem(ak); }
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------ 顶部导航

  function updateUI() {
    var nav = document.querySelector('.nav-inner');
    if (!nav) return;
    var old = document.getElementById('userMenu');
    if (old) old.remove();

    var menu = document.createElement('div');
    menu.id = 'userMenu';
    menu.className = 'user-menu';

    if (nickname) {
      var face = avatar
        ? '<img class="user-avatar-img" src="' + esc(avatar) + '" alt="">'
        : '<span class="user-avatar">' + esc(nickname[0]) + '</span>';
      menu.innerHTML = face +
        '<span class="user-name" title="点击更换头像">' + esc(nickname) + '</span>' +
        '<button class="user-logout" data-act="avatar">头像</button>' +
        '<button class="user-logout" data-act="out">退出</button>';
    } else {
      menu.innerHTML = '<button class="user-login-btn" data-act="in">登录</button>';
    }
    nav.appendChild(menu);

    menu.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'in') openPanel('login');
      else if (act === 'avatar') openAvatarPanel();
      else if (act === 'out') doLogout();
    });
  }

  // ------------------------------------------------------------ 账号面板

  function closePanel() {
    var m = document.getElementById('accountModal');
    if (m) m.remove();
  }

  function openPanel(tab) {
    var old = document.getElementById('accountModal');
    if (old) old.remove();

    var reg = tab === 'register';
    var m = document.createElement('div');
    m.id = 'accountModal';
    m.className = 'modal-overlay';
    m.innerHTML =
      '<div class="modal-box acct-box">' +
        '<h3>登录网站</h3>' +
        '<div class="acct-tabs">' +
          '<button type="button" class="acct-tab' + (reg ? '' : ' active') + '" data-tab="login">登录</button>' +
          '<button type="button" class="acct-tab' + (reg ? ' active' : '') + '" data-tab="register">注册</button>' +
        '</div>' +
        '<input type="text" id="acctName" class="modal-input" placeholder="昵称" maxlength="20" autocomplete="username">' +
        '<input type="password" id="acctPass" class="modal-input" placeholder="密码（至少 6 位）" autocomplete="current-password">' +
        '<input type="password" id="acctPass2" class="modal-input" placeholder="再输一次密码" autocomplete="new-password"' + (reg ? '' : ' style="display:none"') + '>' +
        '<p class="comment-error" id="acctError" style="display:none"></p>' +
        '<p class="acct-hint">昵称就是账号，不用邮箱也不用 GitHub。<br>换个设备用同样的昵称和密码就能登回来。</p>' +
        '<div class="modal-btns">' +
          '<button type="button" class="modal-btn-cancel" id="acctCancel">取消</button>' +
          '<button type="button" class="modal-btn-ok" id="acctOk">' + (reg ? '注册并登录' : '登录') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    var nameEl = document.getElementById('acctName');
    var passEl = document.getElementById('acctPass');
    var pass2El = document.getElementById('acctPass2');
    var errEl = document.getElementById('acctError');
    var okEl = document.getElementById('acctOk');
    var mode = reg ? 'register' : 'login';

    function fail(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    function clearErr() { errEl.style.display = 'none'; }

    function switchTo(next) {
      mode = next;
      var isReg = next === 'register';
      pass2El.style.display = isReg ? '' : 'none';
      okEl.textContent = isReg ? '注册并登录' : '登录';
      passEl.setAttribute('autocomplete', isReg ? 'new-password' : 'current-password');
      m.querySelectorAll('.acct-tab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === next);
      });
      clearErr();
      pass2El.value = '';
      nameEl.focus();
    }

    m.querySelectorAll('.acct-tab').forEach(function (b) {
      b.onclick = function () { switchTo(b.getAttribute('data-tab')); };
    });
    document.getElementById('acctCancel').onclick = function () {
      closePanel();
      resolvePending(null);
    };

    function submit() {
      var name = nameEl.value.trim().replace(/\s+/g, ' ');
      var pwd = passEl.value;
      clearErr();

      if (!name) return fail('请输入昵称');
      if (name.length > 20) return fail('昵称最多 20 个字');
      if (pwd.length < 6) return fail('密码至少 6 位');

      okEl.disabled = true;
      var label = okEl.textContent;
      okEl.textContent = '稍等…';

      var run;
      if (mode === 'register') {
        if (pwd !== pass2El.value) {
          okEl.disabled = false; okEl.textContent = label;
          return fail('两次输入的密码不一样');
        }
        run = SB.auth.nicknameTaken(name).then(function (taken) {
          if (taken === true) {
            var e = new Error('这个昵称已经有人用了，换一个吧；如果本来就是你，切到「登录」。');
            e.friendly = true;
            throw e;
          }
          return SB.auth.signUp(name, pwd);
        });
      } else {
        run = SB.auth.signIn(name, pwd);
      }

      run.then(function () {
        closePanel();
        onAuthChanged();
        resolvePending(nickname);
      }).catch(function (err) {
        okEl.disabled = false;
        okEl.textContent = label;
        fail(humanize(err, mode));
      });
    }

    okEl.onclick = submit;
    m.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { nameEl.focus(); }, 80);
  }

  function humanize(err, mode) {
    if (err && err.friendly) return err.message;
    if (err && err.code === 'confirm_email_on') return err.message;

    var msg = (err && err.message) || '';
    var code = err && err.code;

    if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
      return mode === 'register'
        ? '这个昵称已经注册过了，请切到「登录」。'
        : '昵称或密码不对。忘了密码的话，联系我帮你重置。';
    }
    if (code === 'user_already_exists' || /already registered/i.test(msg)) {
      return '这个昵称已经有人用了，换一个吧。';
    }
    if (code === 'email_address_invalid') {
      return '昵称包含不支持的字符，换一个试试。';
    }
    if (code === 'weak_password' || /password should be/i.test(msg)) {
      return '密码太简单了，换一个长一点的。';
    }
    if (err && err.status === 429) return '操作太频繁，等一会儿再试。';
    if (/too many requests|rate limit/i.test(msg)) return '操作太频繁，等一会儿再试。';
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return '网络不通，检查一下网络再试。';
    }
    if (code === 'over_email_send_rate_limit') {
      return '注册太频繁，过几分钟再试。';
    }
    return msg || '出了点问题，再试一次。';
  }

  function resolvePending(val) {
    if (!pending) return;
    var r = pending;
    pending = null;
    r(val);
  }

  // 登录状态变化后统一收尾：刷导航、通知评论区
  function onAuthChanged() {
    readCache();
    updateUI();
    if (nickname) {
      persist();
      // 以服务端的昵称为准（注册时若重名会被加后缀）
      SB.auth.profile().then(function (p) {
        if (p && p.nickname && p.nickname !== nickname) {
          nickname = p.nickname;
          persist();
          updateUI();
          resolvePending(nickname);
        }
      });
    }
  }

  function doLogout() {
    SB.auth.signOut().then(function () {
      nickname = ''; avatar = '';
      updateUI();
    });
  }

  // ------------------------------------------------------------ 头像

  function openAvatarPanel() {
    var old = document.getElementById('avatarModal');
    if (old) old.remove();

    var cur = avatar;
    var m = document.createElement('div');
    m.id = 'avatarModal';
    m.className = 'modal-overlay';
    m.innerHTML =
      '<div class="modal-box reg-modal-box">' +
        '<h3>头像</h3>' +
        '<div class="modal-avt-row">' +
          '<div class="avt-preview" id="avtPreview">' +
            (cur ? '<img class="avt-preview-img" src="' + esc(cur) + '" alt="">'
                 : '<span class="avt-preview-text">' + esc((nickname || '?')[0]) + '</span>') +
          '</div>' +
          '<div class="modal-avt-actions">' +
            '<p class="modal-hint">图片只保存在这台设备上，不会上传</p>' +
            '<input type="file" id="regAvtInput" accept="image/*" style="display:none">' +
            '<button type="button" class="modal-avt-btn" id="regAvtBtn">选择图片</button>' +
            (cur ? '<button type="button" class="modal-avt-del" id="regAvtDel">移除头像</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="modal-btns">' +
          '<button type="button" class="modal-btn-cancel" id="avtCancel">关闭</button>' +
          '<button type="button" class="modal-btn-ok" id="avtOk">保存</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    var previewEl = document.getElementById('avtPreview');
    var input = document.getElementById('regAvtInput');
    var btn = document.getElementById('regAvtBtn');
    var del = document.getElementById('regAvtDel');

    btn.onclick = function () { input.click(); };
    if (del) del.onclick = function () {
      cur = '';
      previewEl.innerHTML = '<span class="avt-preview-text">' + esc((nickname || '?')[0]) + '</span>';
      del.remove(); del = null;
    };
    input.onchange = function () {
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        cropImage(e.target.result, function (dataUrl) {
          cur = dataUrl;
          previewEl.innerHTML = '<img class="avt-preview-img" src="' + esc(dataUrl) + '" alt="">';
          input.value = '';
        });
      };
      reader.readAsDataURL(file);
    };
    document.getElementById('avtCancel').onclick = function () { m.remove(); };
    document.getElementById('avtOk').onclick = function () {
      avatar = cur;
      persist();
      updateUI();
      m.remove();
    };
  }

  // 圆形裁剪（沿用原实现）
  function cropImage(imageSrc, callback) {
    var existing = document.getElementById('cropDialog');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'cropDialog';
    overlay.className = 'crop-overlay';
    overlay.innerHTML =
      '<div class="crop-box">' +
        '<h3>拖动移动 · 滚轮缩放</h3>' +
        '<div class="crop-area" id="cropArea">' +
          '<canvas id="cropCanvas"></canvas>' +
          '<div class="crop-mask"></div>' +
        '</div>' +
        '<div class="modal-btns crop-btns">' +
          '<button type="button" class="modal-btn-cancel" id="cropCancel">取消</button>' +
          '<button type="button" class="modal-btn-ok" id="cropConfirm">确认裁剪</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var img = new Image();
    img.onload = function () {
      var area = document.getElementById('cropArea');
      var canvas = document.getElementById('cropCanvas');
      var ctx = canvas.getContext('2d');

      var cropSize = 200;
      var areaW = area.clientWidth;
      var areaH = area.clientHeight;

      var MIN_SCALE = Math.max(cropSize / img.width, cropSize / img.height, areaW / img.width, areaH / img.height);
      var MAX_SCALE = MIN_SCALE * 4;
      var scale = MIN_SCALE;
      var imgW, imgH, offsetX, offsetY;
      var dragging = false, startX, startY, startOffX, startOffY;

      function clamp() {
        imgW = img.width * scale;
        imgH = img.height * scale;
        offsetX = Math.max(areaW - imgW, Math.min(0, offsetX));
        offsetY = Math.max(areaH - imgH, Math.min(0, offsetY));
      }
      offsetX = (areaW - img.width * scale) / 2;
      offsetY = (areaH - img.height * scale) / 2;
      clamp();

      canvas.width = areaW; canvas.height = areaH;
      canvas.style.width = areaW + 'px'; canvas.style.height = areaH + 'px';

      function draw() {
        ctx.clearRect(0, 0, areaW, areaH);
        ctx.save();
        ctx.beginPath();
        ctx.arc(areaW / 2, areaH / 2, areaW / 2 - 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, offsetX, offsetY, imgW, imgH);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(areaW / 2, areaH / 2, areaW / 2 - 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
      }
      draw();

      function onMove(e) {
        if (!dragging) return;
        var cx = e.clientX || (e.touches && e.touches[0].clientX);
        var cy = e.clientY || (e.touches && e.touches[0].clientY);
        offsetX = startOffX + (cx - startX);
        offsetY = startOffY + (cy - startY);
        clamp(); draw();
      }
      function onEnd() { dragging = false; }

      area.onmousedown = function (e) { dragging = true; startX = e.clientX; startY = e.clientY; startOffX = offsetX; startOffY = offsetY; e.preventDefault(); };
      area.ontouchstart = function (e) { dragging = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; startOffX = offsetX; startOffY = offsetY; };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchend', onEnd);

      function cleanup() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchend', onEnd);
        overlay.remove();
      }

      area.addEventListener('wheel', function (e) {
        e.preventDefault();
        var oldScale = scale;
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
        var rect = area.getBoundingClientRect();
        var mx = e.clientX - rect.left, my = e.clientY - rect.top;
        var ratio = scale / oldScale;
        offsetX = mx - (mx - offsetX) * ratio;
        offsetY = my - (my - offsetY) * ratio;
        clamp(); draw();
      }, { passive: false });

      document.getElementById('cropConfirm').onclick = function () {
        var out = document.createElement('canvas');
        out.width = cropSize; out.height = cropSize;
        var octx = out.getContext('2d');
        octx.beginPath();
        octx.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, Math.PI * 2);
        octx.clip();
        var cx = areaW / 2, cy = areaH / 2, r = areaW / 2;
        octx.drawImage(img,
          (cx - r - offsetX) * (img.width / imgW),
          (cy - r - offsetY) * (img.height / imgH),
          (r * 2) * (img.width / imgW),
          (r * 2) * (img.height / imgH),
          0, 0, cropSize, cropSize);
        callback(out.toDataURL('image/jpeg', 0.85));
        cleanup();
      };
      document.getElementById('cropCancel').onclick = cleanup;
    };
    img.src = imageSrc;
  }

  // ------------------------------------------------------------ 对外接口

  window._siteGetNickname = function () { return nickname; };
  window._siteGetAvatar = function () { return avatar; };
  window._siteUid = uid;
  window._siteShowRegister = function () { openPanel('login'); };
  window._siteShowLogin = function () { openPanel('login'); };
  window._siteLogout = doLogout;

  // 需要登录才能继续的操作：未登录先弹面板，登录成功 resolve 出昵称
  window._siteRequireLogin = function () {
    if (nickname) return Promise.resolve(nickname);
    return new Promise(function (resolve) {
      pending = resolve;
      openPanel('login');
    });
  };

  readCache();
  updateUI();
  SB.onChange(function () { readCache(); updateUI(); });

  SB.ready.then(function () {
    readCache();
    updateUI();
    if (nickname) persist();
  });
})();
