// 发布助手 · 借助 GitHub 官方页面完成写入
// 原理：把内容拼进 github.com 的「新建 Issue」页面 URL，用户在 GitHub 上点一下提交。
// 好处：前端不需要保存任何写权限令牌，也就不存在泄露问题。
(function () {
  var REPO = 'yjcc520/my-page';
  var MAX_URL_BODY = 5000; // 浏览器 URL 长度有限，正文太长改为复制到剪贴板

  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
    } catch (e) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // opts: { title, body, labels: [] }
  // 返回 { copied: true/false } —— copied 为 true 时正文已复制到剪贴板，需用户手动粘贴
  window._ghNewIssue = function (opts) {
    opts = opts || {};
    var q = [];
    if (opts.title) q.push('title=' + encodeURIComponent(opts.title));
    if (opts.labels && opts.labels.length) q.push('labels=' + encodeURIComponent(opts.labels.join(',')));

    var body = opts.body || '';
    var fits = body.length <= MAX_URL_BODY;
    if (body && fits) q.push('body=' + encodeURIComponent(body));

    var url = 'https://github.com/' + REPO + '/issues/new' + (q.length ? '?' + q.join('&') : '');

    if (body && !fits) {
      copy(body).then(
        function () { window.open(url, '_blank', 'noopener'); },
        function () { window.open(url, '_blank', 'noopener'); }
      );
      return { copied: true };
    }

    window.open(url, '_blank', 'noopener');
    return { copied: false };
  };

  // 打开某个 Issue 页面（用于「删除」这类只能站长操作的动作）
  window._ghIssueUrl = function (number) {
    return 'https://github.com/' + REPO + '/issues/' + number;
  };
})();
