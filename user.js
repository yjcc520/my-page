// 用户系统 - 基于 localStorage 的简单账号
(function() {
  var nickname = localStorage.getItem('site_nickname') || '';
  var avatar = localStorage.getItem('site_avatar') || '';

  function saveProfile(name, avt) {
    nickname = name;
    avatar = avt || '';
    localStorage.setItem('site_nickname', name);
    if (avt) localStorage.setItem('site_avatar', avt);
    else localStorage.removeItem('site_avatar');
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
      var avatarHtml = avatar
        ? '<img class="user-avatar-img" src="' + avatar + '" alt="">'
        : '<span class="user-avatar">' + nickname[0].toUpperCase() + '</span>';
      menu.innerHTML = avatarHtml + '<span class="user-name">' + nickname + '</span><button class="user-logout" onclick="window._siteShowRegister()">编辑</button><button class="user-logout" onclick="window._siteLogout()">退出</button>';
    } else {
      menu.innerHTML = '<button class="user-login-btn" onclick="window._siteShowRegister()">登录</button>';
    }
    nav.appendChild(menu);
  }

  // 注册/编辑弹窗
  function showRegister() {
    var existing = document.getElementById('registerModal');
    if (existing) existing.remove();

    var curName = nickname || '';
    var curAvt = avatar || '';
    var avtPreview = curAvt ? '<img class="avt-preview has-avt" src="' + curAvt + '" alt="">' : '<div class="avt-preview">' + (curName ? curName[0].toUpperCase() : '?') + '</div>';

    var modal = document.createElement('div');
    modal.id = 'registerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-box">' +
      '<h3>' + (nickname ? '编辑资料' : '设置你的昵称') + '</h3>' +
      '<div class="modal-avt-row">' +
        avtPreview +
        '<div>' +
          '<p class="modal-hint">点击上传头像（可选）</p>' +
          '<input type="file" id="regAvtInput" accept="image/*" style="display:none">' +
          '<button class="modal-avt-btn" id="regAvtBtn">选择图片</button>' +
          (curAvt ? '<button class="modal-avt-del" id="regAvtDel">移除头像</button>' : '') +
        '</div>' +
      '</div>' +
      '<input type="text" id="regNameInput" class="modal-input" placeholder="输入昵称" maxlength="20" value="' + curName.replace(/"/g, '&quot;') + '" autofocus>' +
      '<p id="regError" class="comment-error" style="display:none"></p>' +
      '<div class="modal-btns">' +
        '<button class="modal-btn-cancel" onclick="document.getElementById(\'registerModal\').remove()">取消</button>' +
        '<button class="modal-btn-ok" id="regSubmit">确认</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);

    var input = document.getElementById('regNameInput');
    var avtInput = document.getElementById('regAvtInput');
    var avtBtn = document.getElementById('regAvtBtn');
    var avtPreviewEl = modal.querySelector('.avt-preview');
    var avtDel = document.getElementById('regAvtDel');

    avtBtn.onclick = function() { avtInput.click(); };

    avtInput.onchange = function() {
      var file = avtInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        var dataUrl = e.target.result;
        // 压缩到大尺寸
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement('canvas');
          var size = Math.min(img.width, img.height, 200);
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d');
          var sx = (img.width - size) / 2, sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
          var compressed = canvas.toDataURL('image/jpeg', 0.8);
          curAvt = compressed;
          avtPreviewEl.className = 'avt-preview has-avt';
          avtPreviewEl.innerHTML = '';
          var imgEl = document.createElement('img');
          imgEl.src = compressed;
          imgEl.alt = '';
          avtPreviewEl.appendChild(imgEl);
          if (avtDel) avtDel.style.display = 'inline-block';
          else {
            var delBtn = document.createElement('button');
            delBtn.className = 'modal-avt-del';
            delBtn.textContent = '移除头像';
            delBtn.onclick = function() { curAvt = ''; avtPreviewEl.className = 'avt-preview'; avtPreviewEl.innerHTML = (input.value.trim() || '?')[0].toUpperCase(); delBtn.remove(); };
            avtBtn.parentNode.appendChild(delBtn);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };

    if (avtDel) avtDel.onclick = function() { curAvt = ''; avtPreviewEl.className = 'avt-preview'; avtPreviewEl.innerHTML = (input.value.trim() || '?')[0].toUpperCase(); avtDel.remove(); };

    document.getElementById('regSubmit').onclick = function() {
      var name = input.value.trim();
      if (!name) {
        document.getElementById('regError').textContent = '请输入昵称';
        document.getElementById('regError').style.display = 'block';
        return;
      }
      saveProfile(name, curAvt);
      modal.remove();
    };

    input.onkeydown = function(e) {
      if (e.key === 'Enter') document.getElementById('regSubmit').click();
    };
    setTimeout(function() { input.focus(); }, 100);
  }

  window._siteLogout = function() { saveProfile('', ''); };
  window._siteShowRegister = function() { showRegister(); };
  window._siteGetNickname = function() { return nickname; };
  window._siteGetAvatar = function() { return avatar; };

  updateUI();
})();
