/* ==========================================================================
   leaderboard.js · 游戏排行榜（Supabase）
   9 个游戏页共用，避免每个页面各贴一份。

   约定：每个游戏页需要一个 <div class="lb-overlay" id="lbOverlay"> 骨架，
   内部含 #lbList。分数单位与排序方向由 DESC_GAMES 决定：
     - 多数游戏「分越高越好」
     - reaction（反应速度）记的是毫秒，「越低越好」，必须单独升序

   对外接口：
     window.LB.show()          打开榜单
     window.LB.hide()          关闭
     window.LB.load()          重新拉取
     window.LB.submit(score)   提交成绩（需登录；未登录时提示）
     window.submitScore(n)     向后兼容旧调用点
   ========================================================================== */
(function () {
  'use strict';

  // 毫秒计时的游戏：越少越好
  var LOWER_IS_BETTER = { reaction: 1 };
  var UNIT = { reaction: 'ms' };

  var game = (typeof GAME !== 'undefined' && GAME) ||
             (typeof GAME_SNAKE !== 'undefined' && GAME_SNAKE) ||
             (typeof GAME_SHOOT !== 'undefined' && GAME_SHOOT) ||
             (typeof GAME_MEMORY !== 'undefined' && GAME_MEMORY) ||
             (typeof GAME_MINES !== 'undefined' && GAME_MINES) ||
             (typeof GAME_GOMOKU !== 'undefined' && GAME_GOMOKU) ||
             (typeof GAME_TETRIS !== 'undefined' && GAME_TETRIS) ||
             (typeof GAME_POETRY !== 'undefined' && GAME_POETRY) ||
             'game';

  var lower = !!LOWER_IS_BETTER[game];
  var unit = UNIT[game] || '分';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);' +
      'background:rgba(30,41,59,0.92);color:#fff;padding:0.55rem 1.1rem;border-radius:10px;' +
      'font-size:0.85rem;z-index:9999;pointer-events:none;transition:opacity .4s;font-family:inherit';
    document.body.appendChild(d);
    setTimeout(function () { d.style.opacity = '0'; }, 1800);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 2400);
  }

  function listEl() { return document.getElementById('lbList'); }

  // 面板容器各页命名不一（lbOverlay / lbPanel），统一取到
  function panel() {
    return document.getElementById('lbOverlay') || document.getElementById('lbPanel');
  }
  function isOpen(p) {
    return !!p && (p.classList.contains('show') || p.classList.contains('active'));
  }
  function openPanel(p) {
    p.classList.add(p.id === 'lbPanel' ? 'active' : 'show');
  }
  function closePanel(p) {
    p.classList.remove('active', 'show');
  }

  // 拉取榜单：同一人只占一行（取最好成绩），按方向排序取前十
  function load() {
    var list = listEl();
    if (!list) return Promise.resolve();
    list.innerHTML = '<p class="lb-placeholder">加载中...</p>';

    // 用聚合视图拿「每人最好成绩」，服务端已按 game 分组
    var query = 'game=eq.' + encodeURIComponent(game) +
      '&order=' + (lower ? 'best.asc' : 'best.desc') +
      '&limit=50';

    return SB.select('score_board', query).then(function (rows) {
      if (!rows || !rows.length) {
        list.innerHTML = '<p class="lb-placeholder">还没有成绩，来玩一局吧</p>';
        return;
      }
      var me = SB.nickname || '';
      var top = rows.slice(0, 10);
      list.innerHTML = top.map(function (r, i) {
        var mine = me && r.nickname === me;
        var medal = ['🥇', '🥈', '🥉'][i] || (i + 1);
        return '<div class="lb-item' + (mine ? ' lb-me' : '') + '">' +
          '<span class="lb-rank">' + medal + '</span>' +
          '<span class="lb-name">' + esc(r.nickname) + '</span>' +
          '<span class="lb-score">' + r.best + unit + '</span>' +
          '</div>';
      }).join('');
    }).catch(function () {
      list.innerHTML = '<p class="lb-placeholder">加载失败</p>';
    });
  }

  // 提交成绩：昵称与归属由数据库触发器盖章，前端只送分数
  function submit(score) {
    var n = Number(score);
    if (!n) return;
    if (!SB.loggedIn) {
      toast('登录后成绩才能上榜');
      return;
    }
    SB.insert('scores', { game: game, score: n, nickname: '', user_id: null })
      .then(function () {
        toast('成绩已上榜：' + n + unit);
        // 提交后如果榜单开着，顺手刷新
        if (isOpen(panel())) load();
      })
      .catch(function (e) {
        toast((e && e.message) || '提交失败');
      });
  }

  window.LB = {
    show: function () {
      var p = panel();
      if (p) { openPanel(p); load(); }
    },
    hide: function () {
      var p = panel();
      if (p) closePanel(p);
    },
    load: load,
    submit: submit,
    game: game
  };

  // 兼容页面里原有的 window.submitScore(score) 调用
  window.submitScore = submit;
  // 兼容 snake / shoot 里的 showLB / hideLB / loadLeaderboard 旧名
  window.showLB = window.LB.show;
  window.hideLB = window.LB.hide;
  window.loadLeaderboard = load;
})();
