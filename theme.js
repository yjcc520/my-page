// Theme toggle - shared across all pages
(function() {
  var saved = localStorage.getItem('theme');
  if (saved === 'dark') document.body.classList.add('dark');

  function updateIcon() {
    var isDark = document.body.classList.contains('dark');
    document.querySelectorAll('.theme-toggle').forEach(function(btn) {
      btn.textContent = isDark ? '🌙' : '☀️';
      btn.title = isDark ? '切换亮色模式' : '切换暗色模式';
    });
  }

  updateIcon();

  window._toggleTheme = function() {
    var isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateIcon();

    // 如果首页 hero 可见，重播入场动画
    var hero = document.querySelector('.hero-animate');
    if (hero) {
      hero.classList.remove('hero-animate');
      void hero.offsetWidth;
      hero.classList.add('hero-animate');
    }
  };
})();
