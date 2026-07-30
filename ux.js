// ===== UX Enhancements - Shared across all pages =====
(function() {
  // ---- 1. Back to Top ----
  var btt = document.createElement('button');
  btt.id = 'backToTop';
  btt.innerHTML = '↑';
  btt.title = '返回顶部';
  btt.setAttribute('aria-label', '返回顶部');
  document.body.appendChild(btt);

  var ticking = false;
  window.addEventListener('scroll', function() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      btt.classList.toggle('visible', window.scrollY > 400);
      // Nav shadow
      var nav = document.querySelector('nav');
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
      ticking = false;
    });
  }, { passive: true });

  btt.addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ---- 2. Modal ESC + Click-outside close ----
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      // Close any visible modals/overlays
      var modals = document.querySelectorAll('.modal-overlay, .editor-overlay, .crop-overlay, .lightbox.active, .upload-overlay.active');
      modals.forEach(function(m) {
        if (window.getComputedStyle(m).display !== 'none') {
          if (m.id === 'registerModal') { m.remove(); }
          else if (m.classList.contains('editor-overlay') && window.hideEditor) { window.hideEditor(); }
          else if (m.classList.contains('lightbox') && window.closeLightbox) { window.closeLightbox(); }
          else if (m.classList.contains('upload-overlay') && window.closeUpload) { window.closeUpload(); }
          else if (m.id === 'cropDialog') { m.remove(); }
          else { m.style.display = 'none'; }
        }
      });
    }
  });

  // Click outside modal-box to close
  document.addEventListener('click', function(e) {
    var target = e.target;
    // Register modal
    if (target.classList.contains('modal-overlay') && target.id === 'registerModal') {
      target.remove();
    }
    // Editor overlay
    if (target.classList.contains('editor-overlay') && window.hideEditor) {
      window.hideEditor();
    }
    // Crop dialog
    if (target.id === 'cropDialog') {
      target.remove();
    }
  });

  // ---- 3. Scroll Reveal ----
  var revealEls = document.querySelectorAll('.skill-card, .about-card, .blog-card, .game-card, .ta-card, .gallery-item, .lb-card');
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function(el) {
      el.classList.add('reveal-init');
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function(el) { el.classList.add('revealed'); });
  }

  // Re-run on dynamic content
  window._uxObserve = function(container) {
    var els = (container || document).querySelectorAll('.blog-card, .game-card, .ta-card, .gallery-item, .lb-card');
    els.forEach(function(el) {
      if (!el.classList.contains('reveal-init')) {
        el.classList.add('reveal-init');
        if (revealObserver) revealObserver.observe(el);
      }
    });
  };

  // ---- 4. Toast ----
  window._showToast = function(msg, type) {
    type = type || '';
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(function() {
      toast.classList.add('show');
    });

    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 2500);
  };

  // ---- 5. Button Loading State ----
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.classList.contains('btn-loading-once')) {
      btn.classList.add('btn-loading');
      btn.disabled = true;
      btn._origText = btn.textContent;
      setTimeout(function() {
        btn.classList.remove('btn-loading');
        btn.disabled = false;
        if (btn._origText) btn.textContent = btn._origText;
      }, 2000);
    }
  });

  // ---- 6. Prevent body scroll when modal open (MutationObserver) ----
  var modalObserver = new MutationObserver(function() {
    var hasModal = document.querySelector('.modal-overlay, .editor-overlay[style*="display: flex"], .crop-overlay, .upload-overlay.active, .lightbox.active');
    document.body.classList.toggle('scroll-locked', !!hasModal);
  });
  modalObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

  // ---- 7. Ripple effect on buttons ----
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.contact-btn, .blog-write-btn, .game-play-btn, .modal-btn-ok, .tb-btn-publish, .gallery-upload-btn');
    if (!btn || btn.disabled) return;

    var ripple = document.createElement('span');
    ripple.className = 'ripple';
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', function() { ripple.remove(); });
  });

  // ---- 8. Custom Confirm Dialog ----
  window._showConfirm = function(msg, onOk) {
    var existing = document.querySelector('.confirm-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML =
      '<div class="confirm-box">' +
        '<p class="confirm-msg">' + msg + '</p>' +
        '<div class="modal-btns">' +
          '<button class="modal-btn-cancel" id="confirmCancel">取消</button>' +
          '<button class="modal-btn-ok" id="confirmOk" style="background:#e53e3e">确认</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var close = function() {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    };
    document.getElementById('confirmCancel').onclick = close;
    document.getElementById('confirmOk').onclick = function() { close(); if (onOk) onOk(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

    // ESC
    var escHandler = function(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    document.getElementById('confirmOk').focus();
  };
})();
