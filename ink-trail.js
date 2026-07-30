// 水墨留痕 双击即画 首页专属
(function() {
  var c = document.createElement('canvas');
  c.id = 'inkTrail';
  c.style.cssText = 'position:fixed;top:0;left:0;z-index:9998;pointer-events:none;';
  document.body.appendChild(c);
  var ctx = c.getContext('2d');
  var W, H;
  var isDark = document.body.classList.contains('dark');

  function resize() {
    W = c.width = window.innerWidth;
    H = c.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function inkColor() {
    if (isDark) {
      var v = 170 + Math.random() * 50 | 0;
      return { r: v, g: v - 5 | 0, b: v };
    }
    return { r: 35 + Math.random() * 25 | 0, g: 28 + Math.random() * 22 | 0, b: 22 + Math.random() * 20 | 0 };
  }

  function stamp(x, y) {
    var ink = inkColor();
    var alpha = 0.12 + Math.random() * 0.18;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 中心墨团
    var cr = 8 + Math.random() * 14;
    ctx.fillStyle = 'rgb(' + ink.r + ',' + ink.g + ',' + ink.b + ')';
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, Math.PI * 2);
    ctx.fill();

    // 不规则边缘
    for (var i = 0; i < 12; i++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = cr * (0.4 + Math.random() * 0.9);
      var sr = 1.5 + Math.random() * 4;
      ctx.globalAlpha = alpha * (0.3 + Math.random() * 0.5);
      ctx.fillStyle = 'rgb(' +
        (ink.r + Math.random() * 20 - 10 | 0) + ',' +
        (ink.g + Math.random() * 15 - 7 | 0) + ',' +
        (ink.b + Math.random() * 12 - 5 | 0) + ')';
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // 散落微墨点
    for (var j = 0; j < 20; j++) {
      var dx = (Math.random() - 0.5) * cr * 3;
      var dy = (Math.random() - 0.5) * cr * 2.5;
      var dr = 0.6 + Math.random() * 2.5;
      ctx.globalAlpha = alpha * (0.15 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, dr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  document.addEventListener('dblclick', function(e) {
    stamp(e.clientX, e.clientY);
  });

  // 移动端双击
  var lastTap = 0;
  document.addEventListener('touchend', function(e) {
    var now = Date.now();
    if (now - lastTap < 300 && e.changedTouches.length === 1) {
      var t = e.changedTouches[0];
      stamp(t.clientX, t.clientY);
    }
    lastTap = now;
  });

  // 暗色模式切换
  new MutationObserver(function() {
    isDark = document.body.classList.contains('dark');
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // 缓慢消退
  (function fade() {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.008)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    requestAnimationFrame(fade);
  })();
})();
