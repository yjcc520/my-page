// 蜡笔小新 · 眼睛跟随鼠标
// 眼睛坐标基于原图 736x736（已裁为正方形）；canvas 与该分辨率一致，CSS 拉伸覆盖图片。
(function () {
  var canvas = document.getElementById('shinchanEye');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 736, H = 736;

  // 眼睛参数 (原图坐标)：黑色圆形眼睛 + 白色眼珠，贴合小新原图
  var eyes = [
    { cx: 361, cy: 459, r: 36 },  // 左眼
    { cx: 470, cy: 456, r: 36 }   // 右眼
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

// 小新对话气泡：悬停显示第一句，点击循环切换，刷新自动重置（状态仅存于内存）
(function () {
  var floatEl = document.getElementById('shinchanFloat');
  if (!floatEl) return;
  var tip = floatEl.querySelector('.mascot-tip');
  if (!tip) return;

  var lines = [
    '看起来很可疑，不会是青椒吧。',                              // 悬停 / 初始
    '哎呀~人家才没有偷看你呢。',
    '嘘，不要告诉美伢我在蔡梓涵这里睡觉。',
    '你也觉得他这里还不错吧嘿嘿。',                              // 新增
    '好了我要睡觉了，如果没有漂亮大姐姐不要打扰我。',            // 新增
    '我真的没有看你了！',                                        // 新增
    '再点我的话，就尝尝我的动感光波！'                           // 带抖动
  ];
  var finalLine = '不要打扰小新了。';
  var clicks = 0;

  function setTip(t) { tip.textContent = t; }
  setTip(lines[0]); // 初���/悬停时的第一句

  function advance() {
    clicks++;
    if (clicks < lines.length) {
      setTip(lines[clicks]);          // 依次切换各句
    } else {
      setTip(finalLine);              // 之后→不要打扰小新了
    }
    // 出现「动感光波」那句时抖动一下（按文案判断，避免索引错位）
    if (lines[clicks] && lines[clicks].indexOf('动感光波') !== -1) {
      var s = floatEl.querySelector('.shinchan');
      if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }
    }
  }

  floatEl.addEventListener('click', advance);
})();
