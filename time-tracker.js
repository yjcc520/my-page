// 在线时长统计
(function() {
  var KEY_TOTAL = 'site_time_total';
  var KEY_LAST = 'site_time_last';
  var today = new Date().toISOString().split('T')[0];
  var tick = 0, lastTick = Date.now();
  var total = parseInt(localStorage.getItem(KEY_TOTAL) || '0');

  // 仅页面可见时计时
  function onVisibility() {
    if (document.hidden) { tick = 0; return; }
    lastTick = Date.now();
    tick = requestAnimationFrame(countTick);
  }

  function countTick(ts) {
    if (document.hidden) { tick = 0; return; }
    var dt = Date.now() - lastTick;
    if (dt >= 900 && dt <= 1100) { // 约 1 秒
      total++;
      localStorage.setItem(KEY_TOTAL, total);
    }
    lastTick = Date.now();
    tick = requestAnimationFrame(countTick);
  }

  // 今日计时
  var lastDate = localStorage.getItem(KEY_LAST) || '';
  if (lastDate !== today) {
    localStorage.setItem(KEY_LAST, today);
  }

  document.addEventListener('visibilitychange', onVisibility);
  if (!document.hidden) onVisibility();

  // 格式化显示
  window._getOnlineTime = function() {
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var parts = [];
    if (h > 0) parts.push(h + 'h');
    if (m > 0 || h > 0) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  };

  // 渲染到页面
  function render() {
    var el = document.getElementById('onlineTime');
    if (el) el.textContent = '已经在此虚度 ' + window._getOnlineTime();
  }

  // 等 footer 加载后插入
  var tries = 0;
  function tryRender() {
    var ft = document.querySelector('footer');
    if (ft) {
      var el = document.createElement('p');
      el.id = 'onlineTime';
      el.style.cssText = 'text-align:center;color:var(--text-light);font-size:0.82rem;margin-top:0.3rem;';
      render();
      ft.appendChild(el);
      // 每秒更新
      setInterval(render, 1000);
    } else if (tries < 20) {
      tries++;
      setTimeout(tryRender, 200);
    }
  }
  tryRender();
})();
