// Theme toggle - shared across all pages
(function() {
  var saved = localStorage.getItem('theme');
  if (saved === 'dark') document.body.classList.add('dark');
  window._toggleTheme = function() {
    var isDark = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
})();
