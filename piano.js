// 键盘钢琴 — 按 A~L 弹出不同音高
(function() {
  var ctx = null;
  var firstPlay = true;
  var noteMap = { a:'C4',w:'C#4',s:'D4',e:'D#4',d:'E4',f:'F4',t:'F#4',g:'G4',y:'G#4',h:'A4',u:'A#4',j:'B4',k:'C5',o:'C#5',l:'D5',p:'D#5',';':'E5' };
  var freqMap = { 'C4':261.63,'C#4':277.18,'D4':293.66,'D#4':311.13,'E4':329.63,'F4':349.23,'F#4':369.99,'G4':392.00,'G#4':415.30,'A4':440.00,'A#4':466.16,'B4':493.88,'C5':523.25,'C#5':554.37,'D5':587.33,'D#5':622.25,'E5':659.25 };

  // 左上角音符显示
  var noteEl = document.createElement('div');
  noteEl.id = 'pianoNote';
  noteEl.style.cssText = 'position:fixed;top:20px;left:24px;z-index:9999;font-size:1.4rem;color:var(--primary);font-family:\"Noto Serif SC\",serif;opacity:0;transition:opacity 0.2s;pointer-events:none;';
  document.body.appendChild(noteEl);
  var noteTimer = null;

  function ensureCtx() {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playNote(freq) {
    ensureCtx();
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.9);
  }

  function showNote(note) {
    noteEl.textContent = '♪ ' + note;
    noteEl.style.opacity = '1';
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function() { noteEl.style.opacity = '0'; }, 500);
  }

  function sayOnce(msg) {
    var shinchan = document.getElementById('shinchanFloat');
    if (!shinchan) return;
    var tip = shinchan.querySelector('.mascot-tip');
    if (!tip) return;
    tip.textContent = msg;
    tip.style.opacity = '1';
    tip.style.transform = 'translateY(0)';
    setTimeout(function() { tip.style.opacity = '0'; tip.style.transform = 'translateY(6px)'; }, 2000);
  }

  document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    var key = e.key.toLowerCase();
    var note = noteMap[key];
    if (note) {
      playNote(freqMap[note]);
      showNote(note);
      if (firstPlay) {
        firstPlay = false;
        sayOnce('你在弹琴吗？好难听。');
      }
    }
  });
})();
