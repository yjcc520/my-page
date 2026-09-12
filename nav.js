/* 全站统一导航栏 —— 只维护这一个文件，所有页面共用
   用法（nav 与脚本必须相邻，同步加载，不会闪）：
     <nav id="siteNav"></nav>
     <script src="nav.js"></script>
   可选属性：
     data-lang="1"                     显示 中/EN/日 切换（仅引了 lang.js 的页面需要）
     data-extra="标签:地址,标签:地址"   追加页面专属入口
   加新栏目：只改下面的 ITEMS 数组即可。 */
(function () {
  var host = document.getElementById('siteNav');
  if (!host) return;

  /* nav.js 所在目录的绝对地址，保证子目录页面（games/xxx.html）链接也正确 */
  var ROOT = '';
  try {
    var s = document.currentScript && document.currentScript.src;
    if (s) ROOT = s.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  } catch (e) {}

  var ITEMS = [
    { file: 'index.html',       text: '首页',   k: 'nav_home' },
    { file: 'index.html#about', text: '关于我', k: 'nav_about' },
    { file: 'blog.html',        text: '博客',   k: 'nav_blog' },
    { file: 'gallery.html',     text: '画廊',   k: 'nav_gallery' },
    { file: 'forum.html',       text: '论坛',   k: 'nav_forum' },
    { file: 'games.html',       text: '小游戏', k: 'nav_games' },
    { file: 'tests.html',       text: '测试',   k: 'nav_tests' },
    { file: 'visits.html',      text: '访问',   k: 'nav_visits', owner: true }
  ];

  /* 不在导航里、但归属某栏目的页面 → 高亮到该栏目 */
  var ALIAS = {
    'article.html': 'blog.html', 'tags.html': 'blog.html', 'write.html': 'blog.html',
    '2048.html': 'games.html', 'gomoku.html': 'games.html', 'memory.html': 'games.html',
    'minesweeper.html': 'games.html', 'poetry.html': 'games.html', 'reaction.html': 'games.html',
    'shoot.html': 'games.html', 'snake.html': 'games.html', 'tetris.html': 'games.html'
  };

  var cur = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (!cur) cur = 'index.html';
  var activeFile = ALIAS[cur] || cur;

  function esc(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var html = '<div class="nav-inner">'
           + '<a href="' + ROOT + 'index.html" class="logo">Zihan</a>'
           + '<div class="nav-links">';

  ITEMS.forEach(function (it) {
    var attr = ' href="' + ROOT + it.file + '"';
    if (it.k) attr += ' data-i18n-text="' + it.k + '"';
    if (it.owner) attr += ' data-owner="1" style="display:none"';
    if (it.file === activeFile) attr += ' class="active"';
    html += '<a' + attr + '>' + esc(it.text) + '</a>';
  });

  /* 页面专属入口 */
  (host.getAttribute('data-extra') || '').split(',').forEach(function (pair) {
    var i = pair.indexOf(':');
    if (i < 0) return;
    var label = pair.slice(0, i).trim();
    var href = pair.slice(i + 1).trim();
    if (label && href) html += '<a href="' + ROOT + href + '">' + esc(label) + '</a>';
  });

  html += '</div><div class="nav-side">';

  /* 语言切换：只在引了 lang.js 的页面出现 */
  if (host.hasAttribute('data-lang')) {
    html += '<span class="lang-switcher">'
          + '<button class="lang-btn" onclick="_setLang(\'zh\')" id="langZh">中</button>'
          + '<button class="lang-btn" onclick="_setLang(\'en\')" id="langEn">EN</button>'
          + '<button class="lang-btn" onclick="_setLang(\'ja\')" id="langJa">日</button>'
          + '</span>';
  }

  /* 主题按钮（theme.js 全站都有） */
  var dark = false;
  try { dark = localStorage.getItem('theme') === 'dark'; } catch (e) {}
  html += '<button class="theme-toggle" onclick="_toggleTheme()" title="'
        + (dark ? '切换亮色模式' : '切换暗色模式') + '">' + (dark ? '🌙' : '☀️') + '</button>';

  html += '</div></div>';
  host.innerHTML = html;

  /* 语言按钮高亮：防止 lang.js 在这之前已经跑过一轮 */
  function markLang() {
    var lang = (window._siteGetLang && window._siteGetLang()) || 'zh';
    var btn = document.getElementById('lang' + (lang === 'zh' ? 'Zh' : lang === 'en' ? 'En' : 'Ja'));
    if (btn) { btn.style.background = 'var(--primary)'; btn.style.color = '#fff'; }
  }
  markLang();

  /* 「访问」只给站长看（真正的门槛在数据库 RLS，这里只控制显隐） */
  function syncOwner() {
    var a = host.querySelector('[data-owner]');
    if (!a) return;
    var ok = window._siteGetNickname && window._siteGetNickname() === 'yjcc';
    a.style.display = ok ? '' : 'none';
  }
  function boot() {
    syncOwner();
    if (window.SB) {
      if (SB.ready && SB.ready.then) SB.ready.then(syncOwner, syncOwner);
      if (SB.onChange) SB.onChange(syncOwner);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window._siteNavRefresh = function () { markLang(); syncOwner(); };
})();
