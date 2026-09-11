// 站点统计 · 不蒜子（第三方免费计数服务）
// 说明：不需要任何凭据、后端或数据库，纯前端一行脚本即可工作。
// 旧版本依赖 GitHub Issue #82 写入，需要前端持有写权限令牌 —— 已停用。
(function () {
  var SRC = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';

  function read(id) {
    var el = document.getElementById('busuanzi_value_' + id);
    var v = el ? (el.textContent || '').trim() : '';
    return /^\d+$/.test(v) ? v : '';
  }

  function poll(n) {
    var pv = read('site_pv');
    var ppv = read('page_pv');
    if (pv) window._sitePv = pv;
    if (ppv) window._pagePv = ppv;
    if ((pv || ppv) && typeof window._onStatsReady === 'function') {
      window._onStatsReady(window._sitePv || '', window._pagePv || '');
    }
    if (n < 45 && !(pv && ppv)) setTimeout(function () { poll(n + 1); }, 400);
  }

  function load() {
    if (window._bszLoaded) return;
    window._bszLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = SRC;
    s.referrerPolicy = 'no-referrer-when-downgrade';
    document.head.appendChild(s);
    poll(0);
  }

  // 兼容旧调用点：现在什么都不用上报，计数由第三方脚本自动完成
  window._trackVisit = function () {};
  window._trackRead = function () {};
  window._fetchStats = function () { return Promise.resolve({ hits: 0, reads: {} }); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
