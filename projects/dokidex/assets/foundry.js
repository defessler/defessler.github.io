/* DokiDex Handbook — token-stream backdrop + reveal-on-scroll.
   Vanilla JS, no deps. Two independent features:
     1. Canvas backdrop on canvas.token-stream (home hero + chapter hero only, per the
        design contract — never behind body prose, so it is never wired into .prose).
     2. IntersectionObserver driving the .reveal-up utility class.
   Both are no-ops (or disabled outright) under prefers-reduced-motion — see the CSS,
   which keeps .reveal-up fully visible by default and only introduces the hidden state
   inside the no-preference media query. */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var smallViewport = window.innerWidth < 760;

  /* ---------------------------- token-stream backdrop ---------------------------- */
  /* Horizontal lanes of drifting mono glyphs, dim by default. Rare short runs ignite
     cerulean (a tool call, ~1.5s fade) or, more rarely, ember (a model swap). Lateral
     motion only — no vertical rain, no parallax. */

  var GLYPHS = "01{}[]<>/:.-_=+".split("");
  var LANES = 7;
  var PARTICLES_MIN = 30;
  var PARTICLES_MAX = 60;

  function readColor(name, alpha) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    // v is a hex like #7E8C99; convert to rgba() so an alpha can be applied per-particle.
    var r = parseInt(v.slice(1, 3), 16);
    var g = parseInt(v.slice(3, 5), 16);
    var b = parseInt(v.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function initTokenStream(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var width = 0, height = 0;
    var particles = [];
    var raf = null;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    }

    function particleCount() {
      var area = width * height;
      var count = Math.round(area / 9000);
      return Math.max(PARTICLES_MIN, Math.min(PARTICLES_MAX, count));
    }

    function makeParticle(laneIndex, laneCount) {
      return {
        x: Math.random() * width,
        y: ((laneIndex + 0.5) / laneCount) * height,
        speed: 12 + Math.random() * 22, // px/sec, lateral only
        glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        baseAlpha: 0.16 + Math.random() * 0.18,
        // Ignition state: null = dim/idle. When set, {kind, t, dur} drives a fade.
        ignite: null,
        igniteAt: performance.now() + Math.random() * 9000 + 2000
      };
    }

    function seedParticles() {
      var count = particleCount();
      var laneCount = Math.min(LANES, Math.max(3, Math.round(count / 6)));
      particles = [];
      for (var i = 0; i < count; i++) {
        particles.push(makeParticle(i % laneCount, laneCount));
      }
    }

    var lastFrame = performance.now();

    function frame(now) {
      var dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      ctx.clearRect(0, 0, width, height);
      ctx.font = "12px " + (getComputedStyle(document.documentElement).getPropertyValue("--f-mono") || "monospace");
      ctx.textBaseline = "middle";

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.speed * dt;
        if (p.x > width + 12) { p.x = -12; }

        // Roll for a new ignition run once the scheduled time passes and the
        // particle is currently idle.
        if (!p.ignite && now >= p.igniteAt) {
          var roll = Math.random();
          if (roll < 0.10) {
            var isEmber = Math.random() < 0.15; // rare within rare: model-swap flare
            p.ignite = { kind: isEmber ? "ember" : "cerulean", start: now, dur: 1500 };
          }
          p.igniteAt = now + Math.random() * 9000 + 2000;
        }

        var color;
        if (p.ignite) {
          var elapsed = now - p.ignite.start;
          if (elapsed >= p.ignite.dur) {
            p.ignite = null;
            color = readColor("--ink-dim", p.baseAlpha);
          } else {
            var progress = elapsed / p.ignite.dur;
            var flare = Math.sin(progress * Math.PI); // charge up, release down
            var varName = p.ignite.kind === "ember" ? "--ember" : "--cerulean";
            color = readColor(varName, 0.15 + flare * 0.55);
          }
        } else {
          color = readColor("--ink-dim", p.baseAlpha);
        }

        ctx.fillStyle = color;
        ctx.fillText(p.glyph, p.x, p.y);
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    raf = requestAnimationFrame(frame);

    return function stop() {
      if (raf) { cancelAnimationFrame(raf); }
      window.removeEventListener("resize", resize);
    };
  }

  function setupBackdrops() {
    if (reduceMotion || coarsePointer || smallViewport) { return; }
    var canvases = document.querySelectorAll("canvas.token-stream");
    for (var i = 0; i < canvases.length; i++) {
      initTokenStream(canvases[i]);
    }
  }

  /* ---------------------------- reveal-on-scroll ---------------------------- */

  function setupReveal() {
    if (reduceMotion) { return; } // base CSS already renders everything visible

    // Prose children get the reveal treatment automatically — markdown output has no
    // hook for authors to add the class by hand, and this keeps every chapter page
    // consistent without a custom kramdown converter (not allowed on GitHub Pages).
    var proseChildren = document.querySelectorAll(".prose > *");
    for (var i = 0; i < proseChildren.length; i++) {
      proseChildren[i].classList.add("reveal-up");
    }

    var targets = document.querySelectorAll(".reveal-up");
    if (!("IntersectionObserver" in window)) {
      for (var j = 0; j < targets.length; j++) { targets[j].classList.add("is-visible"); }
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    for (var k = 0; k < targets.length; k++) {
      observer.observe(targets[k]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setupBackdrops();
      setupReveal();
    });
  } else {
    setupBackdrops();
    setupReveal();
  }
})();
