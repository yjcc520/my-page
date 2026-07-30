// ===== Easter Eggs & Effects =====
(function() {
  // ---------- 1. Konami Code → 梓树叶飘落 ----------
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

  // ---------- 2. 赛博时钟 ----------
  var clockEl = document.createElement('div');
  clockEl.id = 'hudClock';
  clockEl.innerHTML = '<span id="hudTime"></span>';
  clockEl.style.cssText =
    'position:fixed;top:18px;right:20px;z-index:101;' +
    'font-family:"SF Mono","Cascadia Code","Courier New",monospace;' +
    'text-align:center;pointer-events:none;' +
    'background:rgba(10,15,30,0.5);backdrop-filter:blur(12px) saturate(1.4);' +
    'border:1px solid rgba(129,140,248,0.3);border-radius:10px;padding:6px 18px;' +
    'color:#e0e7ff;font-size:17px;font-weight:500;letter-spacing:0.12em;' +
    'line-height:1.4;' +
    'box-shadow:0 0 24px rgba(58,86,112,0.18),inset 0 0 10px rgba(58,86,112,0.04);' +
    'transition:opacity 0.5s ease;';

  document.body.appendChild(clockEl);

  var colonOn = true;
  function updateClock() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    colonOn = !colonOn;
    var c = colonOn ? ':' : '<span style="opacity:0.25">:</span>';
    document.getElementById('hudTime').innerHTML = h + c + m + c + s;
  }

  updateClock();
  var _clockTimer = setInterval(updateClock, 1000);

  // Hide near footer
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

  // Dark mode
  var clockObserver = new MutationObserver(function() {
    var isDark = document.body.classList.contains('dark');
    clockEl.style.background = isDark
      ? 'rgba(30,41,59,0.45)'
      : 'rgba(10,15,30,0.5)';
  });
  clockObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
