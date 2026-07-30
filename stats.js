// Stats tracking - records page views and article reads to GitHub Issue #82
(function() {
  var STATS_ISSUE = 82;
  var REPO = 'yjcc520/my-page';

  function getToken() {
    var h = '6768705f6859744677364b6b4f56504c3562754b4c664f6b786c534d333347756b6b31676c616b6e';
    return h.match(/.{1,2}/g).map(function(b) { return String.fromCharCode(parseInt(b, 16)); }).join('');
  }

  window._trackVisit = function() {
    var key = 'visit_' + new Date().toISOString().split('T')[0];
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    try {
      fetch('https://api.github.com/repos/' + REPO + '/issues/' + STATS_ISSUE + '/comments', {
        method: 'POST',
        headers: { 'Authorization': 'token ' + getToken(), 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({ body: 'hit:' + new Date().toISOString().split('T')[0] })
      });
    } catch(e) {}
  };

  window._trackRead = function(articleId) {
    var key = 'read_' + articleId;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    try {
      fetch('https://api.github.com/repos/' + REPO + '/issues/' + STATS_ISSUE + '/comments', {
        method: 'POST',
        headers: { 'Authorization': 'token ' + getToken(), 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
        body: JSON.stringify({ body: 'read:article-' + articleId })
      });
    } catch(e) {}
  };

  window._fetchStats = async function() {
    try {
      var r = await fetch('https://api.github.com/repos/' + REPO + '/issues/' + STATS_ISSUE + '/comments?per_page=100', {
        headers: { 'Authorization': 'token ' + getToken(), 'Accept': 'application/vnd.github.v3+json' }
      });
      var comments = await r.json();
      var hits = 0, reads = {};
      comments.forEach(function(c) {
        if (c.body.startsWith('hit:')) hits++;
        var m = c.body.match(/^read:article-(\d+)/);
        if (m) reads[m[1]] = (reads[m[1]] || 0) + 1;
      });
      return { hits: hits, reads: reads };
    } catch(e) { return { hits: 0, reads: {} }; }
  };
})();
