// ===== Easter Eggs & Effects =====
(function() {
  // ---------- 1. Hero 打字机效果 ----------
  var introEl = document.querySelector('.intro');
  if (introEl) {
    var fullText = introEl.textContent;
    introEl.textContent = '';
    introEl.style.borderRight = '2px solid var(--primary)';
    introEl.style.display = 'inline-block';
    var idx = 0;
    var typeTimer = setInterval(function() {
      if (idx < fullText.length) {
        introEl.textContent += fullText[idx];
        idx++;
      } else {
        clearInterval(typeTimer);
        // Blinking cursor
        var blink = true;
        setInterval(function() {
          introEl.style.borderRightColor = blink ? 'transparent' : 'var(--primary)';
          blink = !blink;
        }, 530);
      }
    }, 120);
  }

  // ---------- 2. Konami Code → 梓树叶飘落 ----------
  var konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
  var pos = 0;
  var leavesActive = false;
  var leafCanvas, leafCtx, leaves = [];
  var leafRAF;

  function createLeafCanvas() {
    if (leafCanvas) return;
    leafCanvas = document.createElement('canvas');
    leafCanvas.id = 'leafCanvas';
    leafCanvas.style.cssText = 'position:fixed;top:0;left:0;z-index:9999;pointer-events:none;';
    document.body.appendChild(leafCanvas);
    leafCtx = leafCanvas.getContext('2d');
    resizeLeafCanvas();
    window.addEventListener('resize', resizeLeafCanvas);
  }

  function resizeLeafCanvas() {
    if (!leafCanvas) return;
    leafCanvas.width = window.innerWidth;
    leafCanvas.height = window.innerHeight;
  }

  function Leaf() {
    this.reset();
  }

  Leaf.prototype.reset = function() {
    this.x = Math.random() * window.innerWidth;
    this.y = -40 - Math.random() * 200;
    this.size = 18 + Math.random() * 22;
    this.speed = 0.8 + Math.random() * 2.2;
    this.swing = Math.random() * 2 - 1;
    this.swingSpeed = 0.01 + Math.random() * 0.03;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.04;
    this.opacity = 0.5 + Math.random() * 0.5;
    // Green tones for 梓树叶
    var r = 80 + Math.floor(Math.random() * 60);
    var g = 140 + Math.floor(Math.random() * 80);
    var b = 60 + Math.floor(Math.random() * 50);
    this.color = 'rgba(' + r + ',' + g + ',' + b + ',' + this.opacity + ')';
  };

  Leaf.prototype.update = function() {
    this.y += this.speed;
    this.x += Math.sin(this.swing) * 1.2;
    this.swing += this.swingSpeed;
    this.rotation += this.rotSpeed;
    if (this.y > window.innerHeight + 60) this.reset();
  };

  Leaf.prototype.draw = function(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    // Draw a leaf shape
    ctx.beginPath();
    ctx.ellipse(0, 0, this.size * 0.45, this.size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    // Vein line
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-this.size * 0.4, 0);
    ctx.lineTo(this.size * 0.4, 0);
    ctx.stroke();
    // Stem
    ctx.beginPath();
    ctx.moveTo(-this.size * 0.42, 0);
    ctx.lineTo(-this.size * 0.55, -2);
    ctx.stroke();
    ctx.restore();
  };

  function startLeaves() {
    if (leavesActive) return;
    leavesActive = true;
    createLeafCanvas();

    var count = 40;
    leaves = [];
    for (var i = 0; i < count; i++) {
      var l = new Leaf();
      l.y = Math.random() * window.innerHeight; // Stagger start
      leaves.push(l);
    }

    function animate() {
      if (!leavesActive) return;
      leafCtx.clearRect(0, 0, leafCanvas.width, leafCanvas.height);
      for (var i = 0; i < leaves.length; i++) {
        leaves[i].update();
        leaves[i].draw(leafCtx);
      }
      leafRAF = requestAnimationFrame(animate);
    }
    animate();

    // Show toast
    if (window._showToast) window._showToast('🍃 梓树叶飘落，愿君常安');
    // Auto stop after 15 seconds
    setTimeout(stopLeaves, 15000);
  }

  function stopLeaves() {
    leavesActive = false;
    if (leafRAF) cancelAnimationFrame(leafRAF);
    if (leafCanvas) {
      leafCanvas.remove();
      leafCanvas = null;
    }
    leaves = [];
  }

  function toggleLeaves() {
    if (leavesActive) stopLeaves();
    else startLeaves();
  }

  document.addEventListener('keydown', function(e) {
    if (e.keyCode === konami[pos]) {
      pos++;
      if (pos === konami.length) {
        pos = 0;
        toggleLeaves();
      }
    } else {
      pos = 0;
    }
  });

  // ---------- 3. 赛博 HUD 时钟 ----------
  var clockEl = document.createElement('div');
  clockEl.id = 'hudClock';
  clockEl.innerHTML = '<span id="hudTime"></span><span id="hudDate"></span>';
  clockEl.style.cssText =
    'position:fixed;top:18px;right:20px;z-index:101;font-family:"Courier New",monospace;' +
    'text-align:right;pointer-events:none;' +
    'background:rgba(15,23,42,0.6);backdrop-filter:blur(8px);' +
    'border:1px solid rgba(79,70,229,0.4);border-radius:8px;padding:6px 14px;' +
    'color:#a5b4fc;font-size:13px;line-height:1.5;letter-spacing:0.05em;' +
    'box-shadow:0 0 12px rgba(79,70,229,0.2),inset 0 0 6px rgba(79,70,229,0.1);' +
    'transition:opacity 0.5s ease;';

  document.body.appendChild(clockEl);

  function updateClock() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    var y = now.getFullYear();
    var mo = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    var days = ['日','一','二','三','四','五','六'];
    var wd = days[now.getDay()];

    document.getElementById('hudTime').textContent = h + '<blink>:</blink>' + m + '<blink>:</blink>' + s;
    document.getElementById('hudDate').textContent =
      y + '.' + mo + '.' + d + ' 星期' + wd;
  }

  updateClock();
  setInterval(updateClock, 1000);

  // Hide clock when scrolling near footer
  var clockTicking = false;
  window.addEventListener('scroll', function() {
    if (clockTicking) return;
    clockTicking = true;
    requestAnimationFrame(function() {
      var scrollBottom = window.scrollY + window.innerHeight;
      var docHeight = document.documentElement.scrollHeight;
      clockEl.style.opacity = (docHeight - scrollBottom < 100) ? '0' : '1';
      clockTicking = false;
    });
  }, { passive: true });

  // Dark mode adaptation for clock
  var clockObserver = new MutationObserver(function() {
    var isDark = document.body.classList.contains('dark');
    clockEl.style.background = isDark
      ? 'rgba(30,41,59,0.7)'
      : 'rgba(15,23,42,0.6)';
    clockEl.style.color = isDark ? '#a5b4fc' : '#a5b4fc';
  });
  clockObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
