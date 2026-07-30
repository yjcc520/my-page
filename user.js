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

  function showRegister() {
    var existing = document.getElementById('registerModal');
    if (existing) existing.remove();

    var curName = nickname || '';
    var curAvt = avatar || '';
    var avtPreview = curAvt ? '<img class="avt-preview-img" src="' + curAvt + '" alt="">' : '<span class="avt-preview-text">' + (curName ? curName[0].toUpperCase() : '?') + '</span>';

    var modal = document.createElement('div');
    modal.id = 'registerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = '<div class="modal-box reg-modal-box">' +
      '<h3>' + (nickname ? '编辑资料' : '设置你的昵称') + '</h3>' +
      '<div class="modal-avt-row">' +
        '<div class="avt-preview" id="avtPreview">' + avtPreview + '</div>' +
        '<div class="modal-avt-actions">' +
          '<p class="modal-hint">点击上传头像（可选）</p>' +
          '<input type="file" id="regAvtInput" accept="image/*" style="display:none">' +
          '<button class="modal-avt-btn" id="regAvtBtn">选择图片</button>' +
          (curAvt ? '<button class="modal-avt-del" id="regAvtDel">移除头像</button>' : '') +
        '</div>' +
      '</div>' +
      '<input type="text" id="regNameInput" class="modal-input" placeholder="输入昵称" maxlength="20" value="' + curName.replace(/"/g, '&quot;') + '">' +
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
    var avtPreviewEl = document.getElementById('avtPreview');
    var avtDel = document.getElementById('regAvtDel');

    avtBtn.onclick = function() { avtInput.click(); };

    avtInput.onchange = function() {
      var file = avtInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        showCropDialog(e.target.result, function(croppedDataUrl) {
          curAvt = croppedDataUrl;
          avtPreviewEl.innerHTML = '<img class="avt-preview-img" src="' + croppedDataUrl + '" alt="">';
          if (!avtDel) {
            var delBtn = document.createElement('button');
            delBtn.className = 'modal-avt-del';
            delBtn.id = 'regAvtDel';
            delBtn.textContent = '移除头像';
            delBtn.onclick = function() { curAvt = ''; avtPreviewEl.innerHTML = '<span class="avt-preview-text">' + (input.value.trim() || '?')[0].toUpperCase() + '</span>'; delBtn.remove(); };
            avtBtn.parentNode.appendChild(delBtn);
            avtDel = delBtn;
          }
          avtDel.style.display = 'inline-block';
          avtInput.value = '';
        });
      };
      reader.readAsDataURL(file);
    };

    if (avtDel) avtDel.onclick = function() { curAvt = ''; avtPreviewEl.innerHTML = '<span class="avt-preview-text">' + (input.value.trim() || '?')[0].toUpperCase() + '</span>'; avtDel.remove(); avtDel = null; };

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

  // 裁剪对话框
  function showCropDialog(imageSrc, callback) {
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
          '<button class="modal-btn-cancel" id="cropCancel">取消</button>' +
          '<button class="modal-btn-ok" id="cropConfirm">确认裁剪</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var img = new Image();
    img.onload = function() {
      var area = document.getElementById('cropArea');
      var canvas = document.getElementById('cropCanvas');
      var ctx = canvas.getContext('2d');

      var cropSize = 200;
      var areaW = area.clientWidth;
      var areaH = area.clientHeight;

      var MIN_SCALE = Math.max(cropSize / img.width, cropSize / img.height, areaW / img.width, areaH / img.height);
      var MAX_SCALE = MIN_SCALE * 4;
      var scale = MIN_SCALE;
      var imgW, imgH;
      var offsetX, offsetY;
      var dragging = false, startX, startY, startOffX, startOffY;

      function updateSizes() {
        imgW = img.width * scale;
        imgH = img.height * scale;
        // 保持图片不超出太多
        offsetX = Math.max(areaW - imgW, Math.min(0, offsetX));
        offsetY = Math.max(areaH - imgH, Math.min(0, offsetY));
      }

      // 初始
      offsetX = (areaW - img.width * scale) / 2;
      offsetY = (areaH - img.height * scale) / 2;
      updateSizes();

      canvas.width = areaW;
      canvas.height = areaH;
      canvas.style.width = areaW + 'px';
      canvas.style.height = areaH + 'px';

      function draw() {
        ctx.clearRect(0, 0, areaW, areaH);
        ctx.save();
        ctx.beginPath();
        ctx.arc(areaW/2, areaH/2, areaW/2 - 2, 0, Math.PI*2);
        ctx.clip();
        ctx.drawImage(img, offsetX, offsetY, imgW, imgH);
        ctx.restore();
        // 边框
        ctx.beginPath();
        ctx.arc(areaW/2, areaH/2, areaW/2 - 2, 0, Math.PI*2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      draw();

      // 拖拽
      function onCropMove(e) {
        if (!dragging) return;
        var cx = e.clientX || (e.touches && e.touches[0].clientX);
        var cy = e.clientY || (e.touches && e.touches[0].clientY);
        offsetX = startOffX + (cx - startX);
        offsetY = startOffY + (cy - startY);
        updateSizes();
        draw();
      }
      function onCropEnd() { dragging = false; }
      area.onmousedown = function(e) { dragging = true; startX = e.clientX; startY = e.clientY; startOffX = offsetX; startOffY = offsetY; e.preventDefault(); };
      area.ontouchstart = function(e) { dragging = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY; startOffX = offsetX; startOffY = offsetY; };
      window.addEventListener('mousemove', onCropMove);
      window.addEventListener('touchmove', onCropMove);
      window.addEventListener('mouseup', onCropEnd);
      window.addEventListener('touchend', onCropEnd);

      function cleanupCrop() {
        window.removeEventListener('mousemove', onCropMove);
        window.removeEventListener('touchmove', onCropMove);
        window.removeEventListener('mouseup', onCropEnd);
        window.removeEventListener('touchend', onCropEnd);
        overlay.remove();
      }

      // 滚轮缩放
      area.addEventListener('wheel', function(e) {
        e.preventDefault();
        var oldScale = scale;
        scale *= (e.deltaY < 0) ? 1.1 : 0.9;
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
        // 以鼠标位置为中心缩放
        var rect = area.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        var ratio = scale / oldScale;
        offsetX = mx - (mx - offsetX) * ratio;
        offsetY = my - (my - offsetY) * ratio;
        updateSizes();
        draw();
      });

      // 确认
      document.getElementById('cropConfirm').onclick = function() {
        var resultCanvas = document.createElement('canvas');
        resultCanvas.width = cropSize;
        resultCanvas.height = cropSize;
        var rctx = resultCanvas.getContext('2d');
        rctx.beginPath();
        rctx.arc(cropSize/2, cropSize/2, cropSize/2, 0, Math.PI*2);
        rctx.clip();
        var cx = areaW / 2, cy = areaH / 2, r = areaW / 2;
        var sx = (cx - r - offsetX) * (img.width / imgW);
        var sy = (cy - r - offsetY) * (img.height / imgH);
        var sw = (r * 2) * (img.width / imgW);
        var sh = (r * 2) * (img.height / imgH);
        rctx.drawImage(img, sx, sy, sw, sh, 0, 0, cropSize, cropSize);
        callback(resultCanvas.toDataURL('image/jpeg', 0.85));
        cleanupCrop();
      };

      document.getElementById('cropCancel').onclick = cleanupCrop;
    };
    img.src = imageSrc;
  }

  window._siteLogout = function() { saveProfile('', ''); };
  window._siteShowRegister = function() { showRegister(); };
  window._siteGetNickname = function() { return nickname; };
  window._siteGetAvatar = function() { return avatar; };

  updateUI();
})();
