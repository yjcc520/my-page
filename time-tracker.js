// 在线时长统计
(function() {
  var KEY_TOTAL = 'site_time_total';
  var KEY_LAST = 'site_time_last';
  var total = parseInt(localStorage.getItem(KEY_TOTAL) || '0');
  var timer = null;

  function start() {
    if (timer) return;
    localStorage.setItem(KEY_LAST, new Date().toISOString().split('T')[0]);
    timer = setInterval(function() {
      if (!document.hidden) {
        total++;
        localStorage.setItem(KEY_TOTAL, total);
      }
      render();
    }, 1000);
    render();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    render();
  }

  document.addEventListener('visibilitychange', function() {
    document.hidden ? stop() : start();
  });

  start();

  function format() {
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var parts = [];
    if (h > 0) parts.push(h + 'h');
    if (m > 0 || h > 0) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  function render() {
    var el = document.getElementById('onlineTime');
    if (el) el.textContent = '已经在此虚度 ' + format();
  }

  var tries = 0;
  (function tryRender() {
    var ft = document.querySelector('footer');
    if (ft) {
      var el = document.createElement('p');
      el.id = 'onlineTime';
      el.style.cssText = 'text-align:center;color:var(--text-light);font-size:0.82rem;margin-top:0.3rem;';
      ft.appendChild(el);
      render();
    } else if (tries < 20) {
      tries++;
      setTimeout(tryRender, 200);
    }
  })();
})();
