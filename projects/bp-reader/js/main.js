/* BlueprintReader — Arcane Terminal · interactions */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- nav solidify on scroll ---- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 40);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });

  /* ---- hero staggered reveal on load ---- */
  addEventListener('load', () => {
    document.querySelectorAll('.hero .reveal').forEach((el) => {
      const d = parseInt(el.dataset.d || '0', 10);
      setTimeout(() => el.classList.add('in'), 120 + d * 130);
    });
  });

  /* ---- scroll reveals ---- */
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }),
    { threshold: 0.18 }
  );
  document.querySelectorAll('.reveal-up').forEach((el) => io.observe(el));

  /* ---- count-up for hero stats ---- */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    if (reduce) { el.textContent = target; return; }
    const seen = new IntersectionObserver((ents) => {
      if (!ents[0].isIntersecting) return;
      seen.disconnect();
      const t0 = performance.now(), dur = 1100;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    seen.observe(el);
  });

  /* ---- terminal typewriter (scripted conversation) ---- */
  const script = [
    { c: 'u',   t: '› what does BP_Enemy actually do?' },
    { c: 'a',   t: 'BP_Enemy: 5 vars, 2 functions. BeginPlay seeds health,\n  patrols via a Timeline, fires OnPerception. Want the graph?' },
    { c: 'u',   t: '› give it a 2-second stun when it takes fire damage' },
    { c: 'dim', t: '  + variable  StunTimer (float)' },
    { c: 'dim', t: '  + branch    DamageType == Fire' },
    { c: 'dim', t: '  ~ wire      ApplyStun → SetTimerByEvent(2.0)' },
    { c: 'ok',  t: '  ✓ compiled · saved · backed up  (1 asset, atomic)' },
    { c: 'a',   t: 'Done. Stun wired on fire damage, 2s. Diff is clean.' },
  ];
  const out = document.getElementById('typed');
  let started = false;
  const runTerminal = () => {
    if (started || !out) return; started = true;
    if (reduce) { out.innerHTML = script.map((l) => `<span class="${l.c}">${l.t}</span>`).join('\n'); return; }
    let li = 0;
    const line = () => {
      if (li >= script.length) { setTimeout(() => { out.innerHTML = ''; li = 0; started = true; line(); }, 4200); return; }
      const { c, t } = script[li++];
      const span = document.createElement('span');
      span.className = c; out.appendChild(span);
      let ci = 0;
      const ch = () => {
        span.textContent = t.slice(0, ci++);
        if (ci <= t.length) setTimeout(ch, 14 + Math.random() * 26);
        else { out.appendChild(document.createTextNode('\n')); setTimeout(line, 360); }
      };
      ch();
    };
    line();
  };
  const term = document.querySelector('.terminal');
  if (term) {
    const tio = new IntersectionObserver((e) => { if (e[0].isIntersecting) { runTerminal(); tio.disconnect(); } }, { threshold: 0.4 });
    tio.observe(term);
  }

  /* ---- "coming soon" buttons ---- */
  document.querySelectorAll('[data-soon]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    b.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
      { duration: 280, easing: 'ease-in-out' }
    );
  }));

  /* ====================================================================
     Blueprint-node constellation — the signature backdrop.
     Nodes drift; nearby nodes wire together; pins pulse; parallax to mouse.
     ==================================================================== */
  const cv = document.getElementById('constellation');
  if (!cv || reduce) return;
  const ctx = cv.getContext('2d');
  let W, H, DPR, nodes, mx = 0.5, my = 0.5, raf;

  const palette = ['28,230,255', '255,43,214', '155,107,255'];
  const NODE_COUNT = () => Math.min(54, Math.floor((window.innerWidth * window.innerHeight) / 26000));

  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = cv.width = innerWidth * DPR;
    H = cv.height = innerHeight * DPR;
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    spawn();
  }
  function spawn() {
    const n = NODE_COUNT();
    nodes = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.12 * DPR,
      vy: (Math.random() - 0.5) * 0.12 * DPR,
      r: (1.2 + Math.random() * 2.2) * DPR,
      c: palette[(Math.random() * palette.length) | 0],
      ph: Math.random() * Math.PI * 2,
    }));
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const link = 150 * DPR, px = (mx - 0.5) * 26 * DPR, py = (my - 0.5) * 26 * DPR;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0 || a.x > W) a.vx *= -1;
      if (a.y < 0 || a.y > H) a.vy *= -1;
      // wires to neighbours
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < link) {
          const o = (1 - d / link) * 0.5;
          const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          gr.addColorStop(0, `rgba(${a.c},${o})`);
          gr.addColorStop(1, `rgba(${b.c},${o})`);
          ctx.strokeStyle = gr; ctx.lineWidth = DPR;
          ctx.beginPath();
          // orthogonal "Blueprint wire" elbow
          const midx = (a.x + b.x) / 2;
          ctx.moveTo(a.x + px, a.y + py);
          ctx.lineTo(midx + px, a.y + py);
          ctx.lineTo(midx + px, b.y + py);
          ctx.lineTo(b.x + px, b.y + py);
          ctx.stroke();
        }
      }
    }
    // node "pins"
    for (const a of nodes) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 0.002 + a.ph);
      ctx.fillStyle = `rgba(${a.c},${0.5 + pulse * 0.4})`;
      ctx.shadowBlur = 12 * DPR; ctx.shadowColor = `rgba(${a.c},0.8)`;
      ctx.beginPath();
      ctx.rect(a.x - a.r + px, a.y - a.r + py, a.r * 2, a.r * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    raf = requestAnimationFrame(draw);
  }
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; }, { passive: true });
  addEventListener('resize', () => { cancelAnimationFrame(raf); resize(); raf = requestAnimationFrame(draw); });
  // pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(draw);
  });
  resize();
  raf = requestAnimationFrame(draw);
})();
