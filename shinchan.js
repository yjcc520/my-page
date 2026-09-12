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
// 说到最后一句「不要打扰小新了」之后，再点 10 次 → 小新松口开聊，弹出聊天框
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
  var openLine = '真那你没办法，那就和你聊一聊吧。';
  var openedLine = '那我就在这里说话啦，你快点讲。';
  var clicks = 0;
  var opened = false;   // 聊天框是否已经放过行（放行之后不再重复触发）

  function shake() {
    var s = floatEl.querySelector('.shinchan');
    if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }
  }

  function setTip(t) { tip.textContent = t; }

  // 让气泡常显一会儿：聊天框开着、或刚说完关键台词时，别被 hover 的隐藏规则吃掉
  function peek(ms) {
    floatEl.classList.add('talking');
    clearTimeout(peek._t);
    peek._t = setTimeout(function () { floatEl.classList.remove('talking'); }, ms || 6000);
  }

  setTip(lines[0]); // 初始/悬停时的第一句

  function advance() {
    // 已经开聊了：再点就是催他出来
    if (opened) {
      setTip(openedLine);
      peek(4000);
      if (window.ShinchanChat) window.ShinchanChat.open();
      shake();
      return;
    }

    clicks++;

    if (clicks < lines.length) {
      setTip(lines[clicks]);          // 依次切换各句
      if (lines[clicks].indexOf('动感光波') !== -1) shake();
      return;
    }

    if (clicks < lines.length + 9) {
      // 停留在「不要打扰小新了。」，还要再点 10 次
      setTip(finalLine);
      // 每 2 次抖一下，避免"点了没反应"的错觉
      if ((clicks - lines.length) % 2 === 0) shake();
      return;
    }

    // 第 10 次：小新松口，弹出聊天框
    opened = true;
    setTip(openLine);
    peek(7000);
    shake();
    if (window.ShinchanChat) {
      setTimeout(function () { window.ShinchanChat.open(); }, 520);
    }
  }

  floatEl.addEventListener('click', advance);

  // 聊天框关掉后，气泡回到「不要打扰小新了。」
  document.addEventListener('click', function (e) {
    if (!opened) return;
    if (e.target.closest && e.target.closest('#scClose, #scMask')) {
      setTimeout(function () { if (!window.ShinchanChat || !window.ShinchanChat.isOpen()) setTip(finalLine); }, 0);
    }
  });
})();
