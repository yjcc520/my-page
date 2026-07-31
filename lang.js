// 国际化翻译模块
(function() {
  var langs = {
    zh: {
      nav_home: '首页', nav_about: '关于我', nav_blog: '博客',
      nav_tags: '标签', nav_gallery: '画廊', nav_games: '小游戏',
      hero_greet: '你好，我是', hero_tagline: '中国人',
      section_about: '关于我',
      about_city: '📍 所在城市', about_city_val: '北京 / 长沙',
      about_id: '🎓 身份', about_id_val: '中国人',
      about_worth: '💎 身价', about_worth_val: '江上之清风，山间之明月',
      about_dream: '🎯 理想', about_dream_val: '死得其所',
      about_trait: '✨ 特点', about_trait_val: '十分英俊',
      about_belief: '📿 信仰', about_belief_val: '辩证唯物主义',
      about_shoe: '👟 鞋码', about_shoe_val: '42左右',
      about_state: '🌫️ 精神状态', about_state_val: '孤独、迷惘',
      about_master: '⛓️ 主人', about_master_val: '生命意志',
      section_skills: '技能 & 兴趣',
      section_lb: '游戏排行榜', lb_loading: '加载中…', lb_empty: '暂无排行数据，去<a href="games.html">小游戏</a>玩一局吧', lb_error: '排行榜加载失败',
      section_contact: '联系我', contact_intro: '欢迎交流，一起成长',
      thanks: '致谢：感谢 DeepSeek 大模型，让一个连程序怎么运行都不知道的文科生也能做出个人网页。',
      footer_copy: '© 2026 蔡梓涵 · Powered by GitHub Pages',
      footer_visits: '累计访问：'
    },
    en: {
      nav_home: 'Home', nav_about: 'About', nav_blog: 'Blog',
      nav_tags: 'Tags', nav_gallery: 'Gallery', nav_games: 'Games',
      hero_greet: 'Hello, I am', hero_tagline: 'Chinese',
      section_about: 'About Me',
      about_city: '📍 City', about_city_val: 'Beijing / Changsha',
      about_id: '🎓 Identity', about_id_val: 'Chinese',
      about_worth: '💎 Worth', about_worth_val: 'The clear breeze and bright moon of the river and hills',
      about_dream: '🎯 Dream', about_dream_val: 'A worthy death',
      about_trait: '✨ Trait', about_trait_val: 'Extremely handsome',
      about_belief: '📿 Belief', about_belief_val: 'Dialectical Materialism',
      about_shoe: '👟 Shoe', about_shoe_val: '~42 EU',
      about_state: '🌫️ State', about_state_val: 'Lonely, lost',
      about_master: '⛓️ Master', about_master_val: 'Will to live',
      section_skills: 'Skills & Interests',
      section_lb: 'Leaderboard', lb_loading: 'Loading…', lb_empty: 'No data yet — <a href="games.html">play a game</a>!', lb_error: 'Failed to load',
      section_contact: 'Contact', contact_intro: 'Let\'s connect and grow together.',
      thanks: 'Thanks to DeepSeek AI, who made it possible for a liberal arts student with zero coding knowledge to build a personal website.',
      footer_copy: '© 2026 Zihan Cai · Powered by GitHub Pages',
      footer_visits: 'Visits: '
    },
    ja: {
      nav_home: 'ホーム', nav_about: '私について', nav_blog: 'ブログ',
      nav_tags: 'タグ', nav_gallery: 'ギャラリー', nav_games: 'ゲーム',
      hero_greet: 'こんにちは、', hero_tagline: '中国人',
      section_about: '私について',
      about_city: '📍 都市', about_city_val: '北京 / 長沙',
      about_id: '🎓 身分', about_id_val: '中国人',
      about_worth: '💎 価値', about_worth_val: '江上の清風、山間の明月',
      about_dream: '🎯 理想', about_dream_val: '死に場所を得る',
      about_trait: '✨ 特徴', about_trait_val: '非常にハンサム',
      about_belief: '📿 信仰', about_belief_val: '弁証法的唯物論',
      about_shoe: '👟 靴サイズ', about_shoe_val: '約42',
      about_state: '🌫️ 精神状態', about_state_val: '孤独、迷い',
      about_master: '⛓️ 主人', about_master_val: '生命意志',
      section_skills: 'スキル＆趣味',
      section_lb: 'ランキング', lb_loading: '読み込み中…', lb_empty: 'まだデータがありません — <a href="games.html">ゲームをプレイ</a>！', lb_error: '読み込み失敗',
      section_contact: 'お問い合わせ', contact_intro: '一緒に成長しましょう。',
      thanks: 'DeepSeek AIに感謝 — プログラミングを知らない文系学生でも個人サイトを作れました。',
      footer_copy: '© 2026 Zihan Cai · Powered by GitHub Pages',
      footer_visits: '訪問数：'
    }
  };

  window._t = function(key) {
    var lang = window._siteGetLang ? window._siteGetLang() : 'zh';
    return (langs[lang] && langs[lang][key]) ? langs[lang][key] : (langs.zh[key] || key);
  };

  window._applyI18n = function() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      el.innerHTML = window._t(key);
    });
    document.querySelectorAll('[data-i18n-text]').forEach(function(el) {
      var key = el.getAttribute('data-i18n-text');
      el.textContent = window._t(key);
    });
    // Update leaderboard if already loaded
    if (window._refreshLeaderboard) window._refreshLeaderboard();
    // Update visit count
    if (window._refreshVisits) window._refreshVisits();
  };

  window._setLang = function(l) {
    localStorage.setItem('site_lang', l);
    // Highlight active button
    document.querySelectorAll('.lang-btn').forEach(function(b) { b.style.background = ''; b.style.color = ''; });
    var activeBtn = document.getElementById('lang' + (l === 'zh' ? 'Zh' : l === 'en' ? 'En' : 'Ja'));
    if (activeBtn) { activeBtn.style.background = 'var(--primary)'; activeBtn.style.color = '#fff'; }
    window._applyI18n();
  };

  window._siteGetLang = function() {
    return localStorage.getItem('site_lang') || 'zh';
  };

  // Highlight current lang on load
  (function() {
    var cur = window._siteGetLang();
    var btn = document.getElementById('lang' + (cur === 'zh' ? 'Zh' : cur === 'en' ? 'En' : 'Ja'));
    if (btn) { btn.style.background = 'var(--primary)'; btn.style.color = '#fff'; }
  })();
})();
