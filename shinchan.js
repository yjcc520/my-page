// 蜡笔小新 · 眼睛跟随鼠标
// 眼睛坐标基于原图 736x1596；canvas 与该分辨率一致，CSS 拉伸覆盖图片。
(function () {
  var canvas = document.getElementById('shinchanEye');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 736, H = 1596;

  // 眼睛参数 (原图坐标)：黑色圆形眼睛 + 白色眼珠，贴合小新原图
  var eyes = [
    { cx: 361, cy: 1013, r: 36 },  // 左眼
    { cx: 470, cy: 1010, r: 36 }   // 右眼
  ];
  var pupilR = 11;  // 白色眼珠半径

  function clearAndDraw(mx, my) {
    ctx.clearRect(0, 0, W, H);
    eyes.forEach(function (e) {
      // 黑色圆形眼睛（覆盖原图黑眼，保证纯黑底色）
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(e.cx, e.cy, e.r, 0, Math.PI * 2);
      ctx.fill();

      // 白色眼珠跟随鼠标，限制在黑眼内
      var dx = mx - e.cx, dy = my - e.cy;
      var ang = Math.atan2(dy, dx);
      var d = Math.sqrt(dx * dx + dy * dy);
      var maxOff = e.r - pupilR - 3;
      var t = Math.min(d, 80) / 80;
      var px = e.cx + Math.cos(ang) * maxOff * t;
      var py = e.cy + Math.sin(ang) * maxOff * t;

      // 白色眼珠
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, py, pupilR, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 初始：眼珠居中朝前
  clearAndDraw(W / 2, H / 2);

  function update(clientX, clientY) {
    var box = canvas.parentElement.getBoundingClientRect();
    if (!box.width || !box.height) return;
    var mx = (clientX - box.left) * (W / box.width);
    var my = (clientY - box.top) * (H / box.height);
    clearAndDraw(mx, my);
  }

  window.addEventListener('mousemove', function (e) {
    update(e.clientX, e.clientY);
  });
  window.addEventListener('touchmove', function (e) {
    if (e.touches[0]) update(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
})();
