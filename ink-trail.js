// 水墨留痕 双击即画 首页专属
(function() {
  var c = document.createElement('canvas');
  c.id = 'inkTrail';
  c.style.cssText = 'position:absolute;top:0;left:0;z-index:9998;pointer-events:none;';
  document.body.insertBefore(c, document.body.firstChild);
  var ctx = c.getContext('2d');
  var isDark = document.body.classList.contains('dark');
  var stamps = [];   // [{x, y, ink, cr, edges, dots}]

  function pageW() { return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, window.innerWidth); }
  function pageH() { return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, window.innerHeight); }

  function resize() {
    c.width = pageW();
    c.height = pageH();
    redrawAll();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', function() {
    var ch = pageH();
    if (c.height < ch) { c.height = ch; }
  });

  function inkColor() {
    if (isDark) {
      var v = 170 + Math.random() * 50 | 0;
      return { r: v, g: v - 5 | 0, b: v };
    }
    return { r: 35 + Math.random() * 25 | 0, g: 28 + Math.random() * 22 | 0, b: 22 + Math.random() * 20 | 0 };
  }

  function createStamp(x, y) {
    var cr = 8 + Math.random() * 14;
    var edges = [];
    for (var i = 0; i < 12; i++) {
      edges.push({
        a: Math.random() * Math.PI * 2,
        d: cr * (0.4 + Math.random() * 0.9),
        r: 1.5 + Math.random() * 4
      });
    }
    var dots = [];
    for (var j = 0; j < 20; j++) {
      dots.push({
        dx: (Math.random() - 0.5) * cr * 3,
        dy: (Math.random() - 0.5) * cr * 2.5,
        dr: 0.6 + Math.random() * 2.5
      });
    }
    return { x: x, y: y, ink: inkColor(), cr: cr, edges: edges, dots: dots, life: 1 };
  }

  function drawStamp(s) {
    var ink = s.ink;
    ctx.save();
    ctx.globalAlpha = 0.12 + Math.random() * 0.18 * s.life;

    ctx.fillStyle = 'rgb(' + ink.r + ',' + ink.g + ',' + ink.b + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.cr, 0, Math.PI * 2);
    ctx.fill();

    s.edges.forEach(function(e) {
      ctx.globalAlpha = (0.12 + Math.random() * 0.18) * s.life * (0.3 + Math.random() * 0.5);
      ctx.fillStyle = 'rgb(' +
        (ink.r + Math.random() * 20 - 10 | 0) + ',' +
        (ink.g + Math.random() * 15 - 7 | 0) + ',' +
        (ink.b + Math.random() * 12 - 5 | 0) + ')';
      ctx.beginPath();
      ctx.arc(s.x + Math.cos(e.a) * e.d, s.y + Math.sin(e.a) * e.d, e.r, 0, Math.PI * 2);
      ctx.fill();
    });

    s.dots.forEach(function(d) {
      ctx.globalAlpha = (0.12 + Math.random() * 0.18) * s.life * (0.15 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.arc(s.x + d.dx, s.y + d.dy, d.dr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function redrawAll() {
    ctx.clearRect(0, 0, c.width, c.height);
    stamps.forEach(drawStamp);
  }

  function addStamp(pageX, pageY) {
    stamps.push(createStamp(pageX, pageY));
    drawStamp(stamps[stamps.length - 1]);
  }

  document.addEventListener('dblclick', function(e) {
    addStamp(e.pageX, e.pageY);
  });

  // 移动端双击
  var lastTap = 0;
  document.addEventListener('touchend', function(e) {
    var now = Date.now();
    if (now - lastTap < 300 && e.changedTouches.length === 1) {
      var t = e.changedTouches[0];
      addStamp(t.pageX, t.pageY);
    }
    lastTap = now;
  });

  // 暗色模式切换
  new MutationObserver(function() {
    isDark = document.body.classList.contains('dark');
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // 缓慢消退
  (function fade() {
    for (var i = stamps.length - 1; i >= 0; i--) {
      stamps[i].life -= 0.003;
      if (stamps[i].life <= 0) { stamps.splice(i, 1); }
    }
    if (stamps.length) redrawAll();
    requestAnimationFrame(fade);
  })();
})();
