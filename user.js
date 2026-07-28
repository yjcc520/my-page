// 用户系统 - 基于 localStorage 的简单账号
(function() {
  var nickname = localStorage.getItem('site_nickname') || '';

  function saveNick(name) {
    nickname = name;
    localStorage.setItem('site_nickname', name);
    updateUI();
  }

  function updateUI() {
    var nav = document.querySelector('.nav-inner');
    if (!nav) return;
    var existing = document.getElementById('userMenu');
    if (existing) existing.remove();

    var menu = document.createElement('div');
    menu.id = 'userMenu';
    menu.className = 'user-menu';

    if (nickname) {
      menu.innerHTML = '<span class="user-avatar">' + nickname[0].toUpperCase() + '</span><span class="user-name">' + nickname + '</span><button class="user-logout" onclick="window._siteLogout()">退出</button>';
    } else {
      menu.innerHTML = '<button class="user-login-btn" onclick="window._siteShowRegister()">登录</button>';
    }
    nav.appendChild(menu);
  }

  // 注册弹窗
  function showRegister() {
    var existing = document.getElementById('registerModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'registerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-box">' +
      '<h3>设置你的昵称</h3>' +
      '<p class="modal-hint">设置后所有评论都会显示这个昵称</p>' +
      '<input type="text" id="regNameInput" class="modal-input" placeholder="输入昵称" maxlength="20" autofocus>' +
      '<p id="regError" class="comment-error" style="display:none"></p>' +
      '<div class="modal-btns">' +
        '<button class="modal-btn-cancel" onclick="document.getElementById(\'registerModal\').remove()">取消</button>' +
        '<button class="modal-btn-ok" id="regSubmit">确认</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    var input = document.getElementById('regNameInput');
    document.getElementById('regSubmit').onclick = function() {
      var name = input.value.trim();
      if (!name) {
        document.getElementById('regError').textContent = '请输入昵称';
        document.getElementById('regError').style.display = 'block';
        return;
      }
      saveNick(name);
      modal.remove();
    };
    input.onkeydown = function(e) {
      if (e.key === 'Enter') document.getElementById('regSubmit').click();
    };
    setTimeout(function() { input.focus(); }, 100);
  }

  // 退出
  window._siteLogout = function() {
    saveNick('');
  };

  // 显示注册
  window._siteShowRegister = function() {
    showRegister();
  };

  // 获取当前昵称
  window._siteGetNickname = function() {
    return nickname;
  };

  // 初始化
  updateUI();
})();
