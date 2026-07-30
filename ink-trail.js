// 水墨拖尾 首页专属
(function() {
  var c = document.createElement('canvas');
  c.id = 'inkTrail';
  c.style.cssText = 'position:fixed;top:0;left:0;z-index:9998;pointer-events:none;';
  document.body.appendChild(c);
  var ctx = c.getContext('2d');
  var W, H;
  var lastX = 0, lastY = 0, active = false;
  var isDark = document.body.classList.contains('dark');

  function resize() {
    W = c.width = window.innerWidth;
    H = c.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function inkColor() {
    if (isDark) {
      var v = 160 + Math.random() * 60 | 0;
      return { r: v, g: v, b: v + 10 | 0 };
    }
    return {
      r: 35 + Math.random() * 25 | 0,
      g: 30 + Math.random() * 20 | 0,
      b: 25 + Math.random() * 18 | 0
    };
  }

  function draw(x, y, px, py, speed) {
    var alpha = Math.min(0.15, 0.04 + speed * 0.012);
    var w = Math.max(3, 14 - speed * 1.2);
    var ink = inkColor();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgb(' + ink.r + ',' + ink.g + ',' + ink.b + ')';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (px && py) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    var dots = w * 0.4 | 0;
    for (var i = 0; i < dots; i++) {
      var dx = x + (Math.random() - 0.5) * w * 1.5;
      var dy = y + (Math.random() - 0.5) * w;
      var ds = Math.random() * w * 0.4 + 0.8;
      ctx.globalAlpha = alpha * (0.3 + Math.random() * 0.5);
      ctx.fillStyle = 'rgb(' +
        (ink.r + Math.random() * 15 | 0) + ',' +
        (ink.g + Math.random() * 12 | 0) + ',' +
        (ink.b + Math.random() * 10 | 0) + ')';
      ctx.beginPath();
      ctx.arc(dx, dy, ds, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function handleMove(x, y) {
    if (!active) { lastX = x; lastY = y; active = true; return; }
    var dx = x - lastX, dy = y - lastY;
    var speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 3) return;
    draw(x, y, lastX, lastY, speed);
    lastX = x; lastY = y;
  }

  function handleEnd() { active = false; lastX = 0; lastY = 0; }

  document.addEventListener('mousemove', function(e) { handleMove(e.clientX, e.clientY); });
  document.addEventListener('mouseleave', handleEnd);
  document.addEventListener('touchmove', function(e) { handleMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  document.addEventListener('touchend', handleEnd);

  // 暗色模式切换
  new MutationObserver(function() {
    isDark = document.body.classList.contains('dark');
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // 持续消退
  (function fade() {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.025)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    requestAnimationFrame(fade);
  })();
})();
