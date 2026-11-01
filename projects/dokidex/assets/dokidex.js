/* ============================================================================
   DokiDex site — progressive enhancement only.

   Everything here upgrades markup that already works without JavaScript. Tables scroll via CSS
   if the wrapper never lands; callouts stay readable as blockquotes; code blocks stay
   selectable without a copy button. Nothing on this site requires JS to be readable, which is
   the whole reason the nav drawer is a CSS checkbox rather than a click handler.
   ========================================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- tables ---
     Wide reference tables must scroll inside their own box. Without this the <body> scrolls
     sideways on a phone and every other page element goes with it. */
  function wrapTables() {
    var tables = document.querySelectorAll('.prose > table');
    Array.prototype.forEach.call(tables, function (t) {
      var wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'region');
      var caption = t.querySelector('caption');
      wrap.setAttribute('aria-label', caption ? caption.textContent : 'Scrollable table');
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  /* -------------------------------------------------------- callouts ---
     Markdown authors write:

       > **Key idea** — models do not store text, they store weights.

     which renders as an ordinary blockquote in GitHub's view of the repo and as a styled
     callout here. Keeping the source readable as plain markdown matters: these pages get read
     as files at least as often as they get read as a website. */
  var LABELS = {
    'key idea': 'key', 'key': 'key',
    'note': 'note',
    'warning': 'warn', 'warn': 'warn', 'caution': 'warn',
    'common trap': 'trap', 'trap': 'trap', 'misconception': 'trap',
    'tip': 'tip', 'try it': 'tip'
  };

  function upgradeCallouts() {
    var quotes = document.querySelectorAll('.prose blockquote');
    Array.prototype.forEach.call(quotes, function (q) {
      var first = q.querySelector('p');
      if (!first) return;
      var strong = first.querySelector('strong');
      if (!strong || strong !== first.firstElementChild) return;

      var raw = strong.textContent.trim().toLowerCase().replace(/[:—–-]\s*$/, '').trim();
      var kind = LABELS[raw];
      if (!kind) return;

      q.className = 'callout callout-' + kind;

      var label = document.createElement('span');
      label.className = 'callout-label';
      label.textContent = strong.textContent.trim().replace(/[:—–-]\s*$/, '').trim();
      strong.parentNode.removeChild(strong);

      // The em-dash or colon that separated the label from the sentence is now leading
      // whitespace at the start of the paragraph; strip it so the text starts clean.
      if (first.firstChild && first.firstChild.nodeType === 3) {
        first.firstChild.nodeValue = first.firstChild.nodeValue.replace(/^\s*[—–:-]\s*/, '');
      }
      q.insertBefore(label, q.firstChild);
    });
  }

  /* ------------------------------------------------------ copy button --- */
  function addCopyButtons() {
    if (!navigator.clipboard) return;
    var pres = document.querySelectorAll('.prose pre');
    Array.prototype.forEach.call(pres, function (pre) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        var code = pre.querySelector('code');
        navigator.clipboard.writeText((code || pre).innerText).then(function () {
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
        });
      });
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }

  /* ---------------------------------------------------- token stream ---
     The drifting-glyph backdrop behind the landing hero, matching the handbook's. Colours are
     read from CSS custom properties rather than hard-coded, so retheming the site retints the
     canvas for free.

     Self-disables under reduced-motion, on coarse pointers, and on narrow viewports — on a
     phone this is battery cost for decoration nobody asked for. */
  var GLYPHS = '01{}[]<>/:.-_=+'.split('');

  function readColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function initTokenStream(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, lanes = [], particles = [];

    var dim = readColor('--ink-dim', '#7E8C99');
    var hot = readColor('--cerulean', '#00ACEB');
    var warm = readColor('--ember', '#FF8A50');

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var laneCount = 7;
      lanes = [];
      for (var i = 0; i < laneCount; i++) lanes.push((h / (laneCount + 1)) * (i + 1));

      var count = Math.min(60, Math.max(30, Math.round(w / 22)));
      particles = [];
      for (var p = 0; p < count; p++) particles.push(spawn(true));
    }

    function spawn(seed) {
      return {
        x: seed ? Math.random() * w : -20,
        lane: Math.floor(Math.random() * lanes.length),
        speed: 0.18 + Math.random() * 0.55,
        glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        alpha: 0.18 + Math.random() * 0.32,
        ignite: 0,
        color: dim
      };
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      ctx.font = '13px "IBM Plex Mono", Consolas, monospace';
      ctx.textBaseline = 'middle';

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.speed;

        if (p.x > w + 20) {
          particles[i] = spawn(false);
          continue;
        }

        // Occasional "ignition": a glyph briefly flares as if it were just sampled.
        if (p.ignite > 0) {
          p.ignite -= 0.014;
        } else if (Math.random() < 0.0009) {
          p.ignite = 1;
          p.color = Math.random() < 0.15 ? warm : hot;
        }

        var a = p.ignite > 0 ? p.alpha + p.ignite * 0.55 : p.alpha;
        ctx.fillStyle = p.ignite > 0 ? p.color : dim;
        ctx.globalAlpha = Math.min(1, a);
        ctx.fillText(p.glyph, p.x, lanes[p.lane]);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    }

    var raf = null;
    resize();
    window.addEventListener('resize', function () {
      cancelAnimationFrame(raf);
      resize();
      raf = requestAnimationFrame(step);
    });
    raf = requestAnimationFrame(step);
  }

  function maybeTokenStream() {
    if (reduced) return;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    if (window.innerWidth < 760) return;
    var canvases = document.querySelectorAll('canvas.token-stream');
    Array.prototype.forEach.call(canvases, initTokenStream);
  }

  /* ------------------------------------------------------------- toc ---
     Several of these pages run past 6,000 words. Landing on one with no sense of its shape is the
     biggest comprehension barrier the site has, and hand-maintaining a contents list on eighteen
     pages would rot within a week. So it is generated from the h2s that are already there.

     kramdown's auto_ids means every heading already has a stable id, so the links are real
     anchors that survive being copied and shared. Skipped on short pages, where a contents list
     is just another thing to read before the content. */
  function buildToc() {
    var prose = document.querySelector('.prose');
    var head = document.querySelector('.page-head');
    if (!prose || !head) return;

    var hs = prose.querySelectorAll('h2[id]');
    if (hs.length < 4) return;

    var details = document.createElement('details');
    details.className = 'toc';
    details.open = true;

    var summary = document.createElement('summary');
    summary.innerHTML = 'On this page <span class="toc-count">' + hs.length + ' sections</span>';
    details.appendChild(summary);

    var ul = document.createElement('ul');
    ul.className = 'toc-list';
    Array.prototype.forEach.call(hs, function (h) {
      var li = document.createElement('li');
      li.className = 'toc-item';
      var a = document.createElement('a');
      a.className = 'toc-link';
      a.href = '#' + h.id;
      // Heading text only — a heading containing inline code or a link would otherwise drag
      // its markup into the contents list.
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      ul.appendChild(li);
    });
    details.appendChild(ul);

    head.parentNode.insertBefore(details, head.nextSibling);
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    buildToc();
    wrapTables();
    upgradeCallouts();
    addCopyButtons();
    maybeTokenStream();
  });
})();
