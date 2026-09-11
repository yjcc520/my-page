// 评论系统 · giscus（基于 GitHub Discussions）
// 核心思路：访客用自己的 GitHub 账号在 iframe 里评论，数据存在仓库的 Discussions 中。
// 前端代码里没有任何凭据，站长也不需要维护任何令牌。
//
// 用法：
//   <div class="giscus-host" data-giscus-term="article-12"></div>
//   （可选）data-giscus-kind="wall"  使用留言墙便签风格主题
//   <script src="comments.js"></script>
(function () {
  var REPO = 'yjcc520/my-page';
  var REPO_ID = 'R_kgDOTll2vQ';
  var CATEGORY = 'Announcements';
  var CATEGORY_ID = 'DIC_kwDOTll2vc4DCI4v';

  // 自定义主题：用站点自己的靛青 / 暖金配色覆盖 giscus 默认的 GitHub 蓝
  var THEMES = {
    light: 'https://caizihan.cn/giscus-light.css',
    dark: 'https://caizihan.cn/giscus-dark.css',
    wallLight: 'https://caizihan.cn/giscus-wall-light.css',
    wallDark: 'https://caizihan.cn/giscus-wall-dark.css'
  };

  function isDark() {
    if (document.body.classList.contains('dark')) return true;
    return localStorage.getItem('theme') === 'dark';
  }

  function themeFor(host) {
    var wall = host.getAttribute('data-giscus-kind') === 'wall';
    if (wall) return isDark() ? THEMES.wallDark : THEMES.wallLight;
    return isDark() ? THEMES.dark : THEMES.light;
  }

  function applyTheme(host) {
    var frame = host.querySelector('iframe.giscus-frame');
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      { giscus: { setConfig: { theme: themeFor(host) } } },
      'https://giscus.app'
    );
  }

  function mount(host) {
    if (host.getAttribute('data-giscus-mounted')) return;
    host.setAttribute('data-giscus-mounted', '1');

    var s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-repo', REPO);
    s.setAttribute('data-repo-id', REPO_ID);
    s.setAttribute('data-category', CATEGORY);
    s.setAttribute('data-category-id', CATEGORY_ID);
    s.setAttribute('data-mapping', host.getAttribute('data-giscus-mapping') || 'specific');
    s.setAttribute('data-term', host.getAttribute('data-giscus-term') || location.pathname);
    s.setAttribute('data-strict', '1');
    s.setAttribute('data-reactions-enabled', '1');
    s.setAttribute('data-emit-metadata', '0');
    s.setAttribute('data-input-position', 'top');
    s.setAttribute('data-theme', themeFor(host));
    s.setAttribute('data-lang', 'zh-CN');
    s.setAttribute('data-loading', 'lazy');
    host.appendChild(s);
  }

  function all() {
    return Array.prototype.slice.call(document.querySelectorAll('.giscus-host'));
  }

  function boot() {
    all().forEach(mount);

    // 主题切换时同步 iframe 内的配色
    if (document.body && window.MutationObserver) {
      new MutationObserver(function () {
        all().forEach(applyTheme);
      }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // giscus 加载完成（或重新加载）后，重新套用一次主题
    window.addEventListener('message', function (e) {
      if (e.origin !== 'https://giscus.app') return;
      if (!e.data || !e.data.giscus) return;
      all().forEach(function (h) {
        if (h.querySelector('iframe.giscus-frame')) applyTheme(h);
      });
    });
  }

  // 供动态插入的页面调用（例如文章页拿到 id 之后再挂载）
  window._mountComments = function (selector) {
    var nodes = selector
      ? Array.prototype.slice.call(document.querySelectorAll(selector))
      : all();
    nodes.forEach(mount);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
