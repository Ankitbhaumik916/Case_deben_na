/* =============================================================================
   Forensibus — landing page behaviour
   No framework, no build step. Three concerns: background video fallback,
   stat count-up, mobile menu.
   -----------------------------------------------------------------------------
   BACKGROUND ASSETS — NO CODE CHANGE NEEDED.

   Drop these two files into assets/ and redeploy. index.html already points at
   both paths; nothing in this file or in styles.css has to be touched.

       assets/bg-video.mp4     the approved clip (must be rights-cleared)
       assets/bg-poster.jpg    a still frame from it, same aspect ratio

   The page degrades on its own, in this order:

       1. video plays            both files present
       2. poster image           poster present, video missing or blocked
       3. CSS gradient           neither present  <-- what ships today

   Nothing 404s fatally and no state is broken at any tier. Reduced-motion
   users stop at tier 2 by design: they get the still frame, never the motion.
   ========================================================================== */

(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  /* ==========================================================================
     REAL FIGURES GO HERE.
     --------------------------------------------------------------------------
     Every value is null, so the page renders an em-dash and a "figures pending"
     note rather than a number nobody can stand behind. Replace a null with a
     number and that stat starts counting up on load; replace all four and the
     pending note removes itself.

       'evidence-items': 12480

     Do not put a guess here. An invented figure on a forensics product is the
     kind of claim that gets read back to you in a deposition.
     ====================================================================== */
  var STATS = {
    'case-types': null,
    'compliance-coverage': null,
    'report-turnaround': null,
    'evidence-items': null
  };

  /* ==========================================================================
     Background: video -> poster -> gradient
     --------------------------------------------------------------------------
     Both asset paths are declared in index.html and both are currently empty,
     so today this settles on the gradient. Adding the files promotes the page
     up the tiers with no edit here.
     ====================================================================== */
  function setupVideo() {
    var bg = document.querySelector('.bg');
    var video = document.querySelector('.bg-video');
    if (!bg || !video) return;

    var settled = false;

    // Tier 3. Nothing playable and no poster: remove the element so the CSS
    // gradient underneath is what shows.
    function fallToGradient(reason) {
      bg.classList.remove('video-ready', 'poster-active');
      bg.classList.add('video-missing');
      if (window.console && console.info) {
        console.info(
          '[forensibus] Background video and poster unavailable (' +
            reason +
            '). Showing the gradient. Add assets/bg-video.mp4 and ' +
            'assets/bg-poster.jpg to enable them.'
        );
      }
    }

    // Tier 2. The video cannot play, but a poster may still be there. Probe it
    // before hiding anything — hiding the <video> would hide its poster too,
    // which is precisely the state this page ships in.
    function fallToPoster(reason) {
      if (settled) return;
      settled = true;

      var posterUrl = video.getAttribute('poster');
      if (!posterUrl) {
        fallToGradient(reason + ', no poster declared');
        return;
      }

      var probe = new Image();
      probe.onload = function () {
        // Leave the <video> in the DOM and visible: the poster is what paints.
        bg.classList.remove('video-missing');
        bg.classList.add('poster-active');
      };
      probe.onerror = function () {
        fallToGradient(reason + ', poster also absent');
      };
      probe.src = posterUrl;
    }

    // Tier 1.
    video.addEventListener('canplay', function () {
      settled = true;
      bg.classList.remove('video-missing', 'poster-active');
      bg.classList.add('video-ready');
    });

    // Motion sensitivity outranks decoration: hold at the still frame.
    if (prefersReducedMotion) {
      try {
        video.pause();
        video.removeAttribute('autoplay');
      } catch (e) {
        /* no-op */
      }
      fallToPoster('prefers-reduced-motion');
      return;
    }

    // A failed <source> raises its error on the source element, not the video.
    var source = video.querySelector('source');
    if (source) {
      source.addEventListener('error', function () {
        fallToPoster('source failed to load');
      });
    }
    video.addEventListener('error', function () {
      fallToPoster('decode error');
    });

    // Autoplay can be refused even when muted.
    var attempt = video.play();
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(function () {
        fallToPoster('autoplay blocked');
      });
    }

    // NETWORK_NO_SOURCE (3) is the reliable "nothing to play" signal.
    window.setTimeout(function () {
      if (settled) return;
      if (video.networkState === 3 || video.readyState === 0) {
        fallToPoster('no playable source');
      }
    }, 2500);
  }

  /* ==========================================================================
     Stat count-up
     ====================================================================== */
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function formatValue(value) {
    return Math.round(value).toLocaleString('en-US');
  }

  function setupStats() {
    var statsEl = document.querySelector('.stats');
    var items = Array.prototype.slice.call(document.querySelectorAll('.stat'));
    if (!items.length) return;

    var realCount = 0;

    items.forEach(function (item) {
      var key = item.getAttribute('data-stat');
      var valueEl = item.querySelector('.stat-value');
      if (!valueEl) return;

      var value = Object.prototype.hasOwnProperty.call(STATS, key)
        ? STATS[key]
        : null;

      if (typeof value === 'number' && isFinite(value)) {
        valueEl.setAttribute('data-count-to', String(value));
        valueEl.classList.remove('is-placeholder');
        realCount += 1;
      } else {
        // Unfilled: leave the em-dash from the markup, mark it as pending.
        valueEl.removeAttribute('data-count-to');
        valueEl.classList.add('is-placeholder');
        valueEl.setAttribute('title', 'Figure not published yet');
      }
    });

    if (statsEl && realCount === items.length) {
      statsEl.setAttribute('data-all-real', 'true');
    }

    var countable = items.filter(function (item) {
      var v = item.querySelector('.stat-value');
      return v && v.hasAttribute('data-count-to');
    });

    if (!countable.length) return;

    if (prefersReducedMotion) {
      countable.forEach(function (item) {
        var el = item.querySelector('.stat-value');
        var target = parseFloat(el.getAttribute('data-count-to'));
        el.textContent = formatValue(target) + (el.getAttribute('data-suffix') || '');
      });
      return;
    }

    function run(item, index) {
      var el = item.querySelector('.stat-value');
      var target = parseFloat(el.getAttribute('data-count-to'));
      var suffix = el.getAttribute('data-suffix') || '';
      var duration = 1500 + index * 80;
      var delay = 480 + index * 90;

      window.setTimeout(function () {
        var start = null;
        function frame(now) {
          if (start === null) start = now;
          var progress = Math.min((now - start) / duration, 1);
          el.textContent = formatValue(target * easeOutCubic(progress)) + suffix;
          if (progress < 1) {
            window.requestAnimationFrame(frame);
          } else {
            el.textContent = formatValue(target) + suffix;
          }
        }
        window.requestAnimationFrame(frame);
      }, delay);
    }

    if (!('IntersectionObserver' in window)) {
      countable.forEach(run);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var index = countable.indexOf(entry.target);
          observer.unobserve(entry.target); // once only
          if (index > -1) run(entry.target, index);
        });
      },
      { threshold: 0.25 }
    );

    countable.forEach(function (item) {
      observer.observe(item);
    });
  }

  /* ==========================================================================
     Mobile menu
     ====================================================================== */
  function setupMenu() {
    var burger = document.querySelector('.burger');
    var overlay = document.querySelector('.menu-overlay');
    var sheet = document.getElementById('mobile-menu');
    if (!burger || !overlay || !sheet) return;

    function open() {
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Close menu');
      overlay.hidden = false;
      sheet.hidden = false;
      document.body.classList.add('menu-open');
    }

    function close() {
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      overlay.hidden = true;
      sheet.hidden = true;
      document.body.classList.remove('menu-open');
    }

    function isOpen() {
      return burger.getAttribute('aria-expanded') === 'true';
    }

    burger.addEventListener('click', function () {
      if (isOpen()) {
        close();
      } else {
        open();
      }
    });

    overlay.addEventListener('click', close);

    sheet.addEventListener('click', function (event) {
      if (event.target.closest('a')) close();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) {
        close();
        burger.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 720 && isOpen()) close();
    });

    close();
  }

  /* ==========================================================================
     Placeholder links
     Product / Solutions / Contact have no destination yet. Swallow the click so
     the page does not jump or push a bare "#" into history.
     ====================================================================== */
  function setupPlaceholderLinks() {
    var links = document.querySelectorAll('a[href="#"]');
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
      });
    });
  }

  function init() {
    setupVideo();
    setupStats();
    setupMenu();
    setupPlaceholderLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
