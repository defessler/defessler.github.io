/* 2K27 Build Lab - calculator logic.
 * Data modules (window.CAPS, BODIES, BADGES, TAKEOVERS, ANIMATIONS, BLUEPRINTS, MODEL) load before this file.
 */
(function () {
  "use strict";

  const ATTRS = CAPS.attrs;
  const SHORT = ["Close Shot", "Driving Layup", "Driving Dunk", "Standing Dunk", "Post Control",
    "Mid-Range", "Three-Point", "Free Throw", "Pass Accuracy", "Ball Handle", "Speed With Ball",
    "Interior D", "Perimeter D", "Steal", "Block", "Off. Rebound", "Def. Rebound",
    "Speed", "Agility", "Strength", "Vertical"];
  // color is the fill (rails, chips, ticks); ink is the same hue darkened enough to read as text
  // on a light ground. In dark mode the two are the same value.
  const DISCS = [
    { key: "Finishing", idx: [0, 1, 2, 3, 4], color: "var(--fin)", ink: "var(--fin-ink)" },
    { key: "Shooting", idx: [5, 6, 7], color: "var(--sht)", ink: "var(--sht-ink)" },
    { key: "Playmaking", idx: [8, 9, 10], color: "var(--ply)", ink: "var(--ply-ink)" },
    { key: "Defense", idx: [11, 12, 13, 14], color: "var(--def)", ink: "var(--def-ink)" },
    { key: "Rebounding", idx: [15, 16], color: "var(--reb)", ink: "var(--reb-ink)" },
    { key: "Physicals", idx: [17, 18, 19, 20], color: "var(--phy)", ink: "var(--phy-ink)" },
  ];
  const DISC_OF = {}; DISCS.forEach((d, di) => d.idx.forEach(i => DISC_OF[i] = di));
  const DISC_COLOR = {}, DISC_INK = {}; DISCS.forEach(d => { DISC_COLOR[d.key] = d.color; DISC_INK[d.key] = d.ink; });
  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
  const POS_NAME = { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward", PF: "Power Forward", C: "Center" };
  const TIER_NAMES = ["", "Bronze", "Silver", "Gold", "Hall of Fame"];

  const $ = (id) => document.getElementById(id);
  const ft = (inches) => `${Math.floor(inches / 12)}'${inches % 12}"`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- state ----------
  const state = {
    pos: "PG", h: 75, w: 198, ws: 78,
    want: Array(21).fill(25),   // what the user asked for
    values: Array(21).fill(25), // after caps + linked minimums
    forced: new Set(), limited: new Set(),
    tab: "badges", animOpen: {}, animSearch: "", animOnly: true, badgeOnly: false,
    cbPlan: Array(21).fill(0),   // cap breakers planned per attribute (0-5)
    currentOvr: null,            // where the MyPLAYER actually is now; null means already maxed
    lockBudget: true,            // refuse any raise that would spend past the 99 ceiling
  };
  const CB_TOTAL_NOW = 20, CB_TOTAL_YEAR = 28, CB_MAX_PER_ATTR = 5;

  // ---------- caps ----------
  function capsFor(h, ws, w) {
    const hh = CAPS.heights[String(h)]; if (!hh) return null;
    const e = hh[String(ws)]; if (!e) return null;
    if (w < e.w0 || w > e.w1) return null;
    const i = (w - e.w0) * 21;
    const blk = e.rows.slice(i, i + 21);
    return Array.from(blk, ch => 25 + CAPS.alphabet.indexOf(ch));
  }

  function bodyRange() {
    return BODIES[state.pos][String(state.h)];
  }

  // ---------- linked minimums ----------
  // rules: [source, target, distance] meaning target >= source - distance, and source <= cap[target] + distance.
  //
  // The source ceiling depends only on the caps, never on the current values, so it is computed once
  // up front. Everything after that only ever raises, which converges to the single lowest set of
  // values satisfying the rules, whatever order they are visited in. Interleaving the clamp with the
  // raises instead would let a raise read a source that a later rule pulls back down, stranding a
  // target above anything the rules actually demand and charging the user budget for it.
  // `rules` is optional and exists only so the page can compare its own rule set against a
  // neighbouring height's. Everything else calls this with three arguments and gets this height's.
  function normalize(want, caps, h, rules) {
    rules = rules || MODEL.linkedRules(h);
    const ceiling = caps.slice();
    for (const [s, t, d] of rules) ceiling[s] = Math.max(25, Math.min(ceiling[s], caps[t] + d));

    const forced = new Set(), limited = new Set();
    const v = want.map((x, i) => {
      const asked = clamp(x, 25, caps[i]);
      if (asked > ceiling[i]) limited.add(i);
      return Math.min(asked, ceiling[i]);
    });
    let changed = true, guard = 0;
    while (changed && guard++ < 60) {
      changed = false;
      for (const [s, t, d] of rules) {
        const need = Math.min(ceiling[t], v[s] - d);
        if (v[t] < need) {
          v[t] = need;
          if (v[t] > want[t]) forced.add(t);
          changed = true;
        }
      }
    }
    return { values: v, forced, limited };
  }

  // ---------- tokens ----------
  function tokenCounts(values, h) {
    const ladders = MODEL.tokenLadders(h);   // per attribute: {d, t:[ratings]} or null
    const perDisc = [0, 0, 0, 0, 0, 0];
    const perAttr = values.map(() => 0);
    if (!ladders) return { perDisc: null, perAttr, known: false };
    ladders.forEach((lad, i) => {
      if (!lad || lad.d === null) return;
      const n = lad.t.filter(th => values[i] >= th).length;
      perAttr[i] = n; perDisc[lad.d] += n;
    });
    return { perDisc, perAttr, known: true };
  }

  // ---------- badges ----------
  function badgeTier(b, values, h) {
    if (h < b.minH || h > b.maxH) return { tier: 0, eligible: false };
    let best = 0;
    for (let t = 4; t >= 1; t--) {
      const ok = b.logic === "AND"
        ? b.reqs.every(r => r.tiers[t - 1] !== null && values[r.attr] >= r.tiers[t - 1])
        : b.reqs.some(r => r.tiers[t - 1] !== null && values[r.attr] >= r.tiers[t - 1]);
      if (ok) { best = t; break; }
    }
    return { tier: best, eligible: true };
  }
  function badgeNextText(b, values, tier) {
    if (tier >= 4) return "Hall of Fame reached";
    const t = tier; // next tier index t (0-based into tiers array)
    const parts = b.reqs.map(r => {
      const need = r.tiers[t];
      if (need === null) return null;
      const have = values[r.attr];
      return `${SHORT[r.attr]} ${have >= need ? "✓" : `${have}→<b>${need}</b>`}`;
    }).filter(Boolean);
    return `${TIER_NAMES[t + 1]} needs ${parts.join(b.logic === "AND" ? " and " : " or ")}`;
  }

  // ---------- rendering: attributes ----------
  const attrEls = [];
  function buildAttrColumn() {
    const col = $("attrCol"); col.innerHTML = "";
    DISCS.forEach((d, di) => {
      const panel = document.createElement("section");
      panel.className = "panel disc"; panel.style.setProperty("--c", d.color); panel.style.setProperty("--ci", d.ink);
      panel.innerHTML = `<div class="panel-h"><h2>${d.key}</h2><div class="meta"><span class="tok" data-tok="${di}"></span><span data-disc-tokens="${di}"></span></div></div><div class="rows"></div>`;
      const rows = panel.querySelector(".rows");
      d.idx.forEach(i => {
        const row = document.createElement("div");
        row.className = "attr";
        row.innerHTML = `
          <div class="name">${ATTRS[i]}</div>
          <div class="track"><input type="range" min="25" max="99" step="1" data-range="${i}" aria-label="${ATTRS[i]}" aria-describedby="capdesc-${i}"><div class="ticks" data-ticks="${i}"></div><div class="capline" data-capline="${i}"></div></div>
          <div class="stepper">
            <button type="button" class="step" data-down="${i}" aria-label="Lower ${ATTRS[i]}">&minus;</button>
            <input type="number" min="25" max="99" step="1" data-num="${i}" aria-label="${ATTRS[i]} value" aria-describedby="capdesc-${i}">
            <button type="button" class="step" data-up="${i}" aria-label="Raise ${ATTRS[i]}">+</button>
          </div>
          <div class="cap num" id="capdesc-${i}">cap <b data-cap="${i}">--</b></div>
          <div class="meta"><small class="note" data-forced="${i}"></small><span class="unlocks num" data-next="${i}"></span></div>`;
        rows.appendChild(row);
        attrEls[i] = {
          row, range: row.querySelector("input[type=range]"), num: row.querySelector("input[type=number]"),
          cap: row.querySelector("[data-cap]"), forced: row.querySelector("[data-forced]"), ticks: row.querySelector("[data-ticks]"),
          capline: row.querySelector("[data-capline]"), next: row.querySelector("[data-next]"),
          up: row.querySelector("[data-up]"), down: row.querySelector("[data-down]")
        };
        // Both of these carry the DISPLAY, not the request. A linked cap or a body change can leave
        // the request far above what the row shows, and an event that lands on the value already
        // shown is asking for nothing: writing it back destroyed the carried request silently, the
        // same loss the "+" button used to cause. Only a value that actually differs from the
        // display is a request to change anything.
        attrEls[i].range.addEventListener("input", e => setWantFromControl(i, e.target.value));
        attrEls[i].num.addEventListener("change", e => setWantFromControl(i, e.target.value));
        attrEls[i].num.addEventListener("keydown", e => {
          if (e.key === "ArrowUp") { e.preventDefault(); step(i, +1); }
          if (e.key === "ArrowDown") { e.preventDefault(); step(i, -1); }
        });
        bindStep(attrEls[i].up, i, +1);
        bindStep(attrEls[i].down, i, -1);
      });
      col.appendChild(panel);
    });
  }

  // The single place a rating is set. Everything routes through here so an attribute can never be
  // pushed past what this body allows: the cap for that body, and 99, which nothing exceeds.
  const HARD_CAP = 99, FLOOR = 25;
  function ceilingFor(i) {
    const caps = state.caps || [];
    return Math.min(HARD_CAP, caps[i] || HARD_CAP);
  }
  // ---------- the budget lock ----------
  // A build's real limit is not the per-attribute cap, it is the 99 overall the attributes add up
  // to, and it is easy to spend past that one point at a time without noticing. With the lock on,
  // no raise is allowed to cross it.
  //
  // The line is 99, the same number the header counts down to, and deliberately NOT the
  // 99 + OVER_TOLERANCE that renderOverall uses before it will call a build over budget. Those two
  // do different jobs: the lock stops you at the ceiling, the accusation waits until you are past
  // it by more than the model's own error. Stopping at 99 and then saying "not over budget yet"
  // would be the page arguing with itself.
  //
  // Honest limit: the overall is an estimate (held out, within a point about three quarters of the
  // time), so this cannot be a guarantee about the game, only about our own number. That is what
  // the unlock is for, and why the label says what it says.
  const BUDGET = 99;
  function rawIf(i, v) {
    const want = state.want.slice();
    want[i] = v;
    const n = normalize(want, state.caps, state.h);
    return MODEL.overall(state.h, n.values).raw;
  }
  function affordable(i, v) { return rawIf(i, v) <= BUDGET + 1e-9; }
  // Largest value at or below `want` that stays inside the budget. Never returns less than what the
  // attribute already shows, so a build that is already over (loaded from a share code, or left
  // over after a body change) freezes where it is rather than being silently cut down.
  //
  // This walks down from the request rather than bisecting. Not because bisection is wrong here: it
  // was checked against this scan on 3,646 random build-and-attribute cases and agreed on every one.
  // The estimate does jump when a raise flips which archetype the build reads as (on a 6'5" build
  // Steal 98 -> 99 moves it 2.72, the largest such jump at that height), but the jump goes UP, so the
  // function stays monotonic and bisection holds. The scan is kept anyway because it does not depend on that
  // property being true, only on the probe, and a future change to the classifier could break it
  // silently. At most 74 probes, on a raise only, which is nothing next to a render.
  function budgetMaxFor(i, want) {
    // Only a value above what the row already shows can change anything, so the scan stops there.
    const shown = Math.min(state.values[i], want);
    for (let v = want; v > shown; v--) if (affordable(i, v)) return v;
    // Nothing was grantable. Leave the stored request where it was rather than adopting the number
    // on screen. On a row a linked minimum is holding up, the request can sit forty points under
    // the display, and returning the display committed every one of those points: the screen did
    // not move, so there was no feedback, and the build stayed inflated once the linked attribute
    // came back down. Same failure the minus button had, from the other side.
    return Math.min(state.want[i], want);
  }
  function setWant(i, v) {
    const n = Math.round(Number(v));
    let want = clamp(Number.isFinite(n) ? n : FLOOR, FLOOR, ceilingFor(i));
    // Only raises are checked. Lowering is always allowed, which is what lets you dig out of an
    // over-budget build.
    if (state.lockBudget && state.caps && want > state.values[i]) want = budgetMaxFor(i, want);
    state.want[i] = want;
    recompute();
  }
  // What a stepper press starts counting from. A link can push the two apart in either direction:
  // a linked MINIMUM holds the display above the request, a linked CAP holds it below. Taking the
  // lower of the pair for a decrement and the higher for an increment is what keeps a press moving
  // the request only in the direction pressed.
  //
  // Both of the wrong choices here were real bugs. Stepping down from the display on a
  // linked-minimum row wrote a request of 33 under a display of 34: nothing moved on screen, so
  // there was no feedback, and the build had quietly gained eight points that resurfaced as spent
  // budget once the linked attribute came down. Stepping up from the display on a linked-cap row
  // did the mirror image, rewriting a standing request of 99 down to 96 because 95 was showing.
  function stepFrom(i, delta) {
    return delta < 0 ? Math.min(state.values[i], state.want[i]) : Math.max(state.values[i], state.want[i]);
  }
  // What a press would land on, or null when it would not move the request in the direction
  // pressed. That last part is the whole point, and getting it wrong cost real points.
  //
  // The guard used to be `next !== from`, which is not the same thing. Change the body and the caps
  // drop, but the stored request does not: a row can sit with a request of 99 under a cap of 25.
  // stepFrom takes the higher of request and display on a raise, so `from` is 99, and clamping
  // 100 to the cap gives 25. That is different from 99, so the old guard wrote it, and one press of
  // "+" destroyed 74 points with the row, the note, the cap text and the header hint all unchanged,
  // then committed it to the share code and localStorage 150ms later. Up to 74 points, no feedback,
  // no undo. A press must only ever move the request the way it was pressed.
  function stepTarget(i, delta) {
    const from = stepFrom(i, delta);
    const next = clamp(from + delta, FLOOR, ceilingFor(i));
    return (delta > 0 ? next > from : next < from) ? next : null;
  }
  // Whether a press can move anything at all. A button that cannot is disabled rather than left
  // looking live: on random builds the minus was dead on about two rows in five.
  function stepMoves(i, delta) { return stepTarget(i, delta) !== null; }
  function step(i, delta) {
    const next = stepTarget(i, delta);
    if (next !== null) setWant(i, next);
  }
  // What the slider and the number field go through. Named so the audit can drive the same path the
  // page does rather than re-implementing the guard and testing its own copy.
  function setWantFromControl(i, v) {
    // Whenever this refuses to change anything, the CONTROL still has to be put back to what the row
    // actually shows. The refusals below all return before setWant, so nothing recomputes and
    // nothing re-renders, and re-rendering is what used to drag the slider knob back to the cap.
    // Without this, dragging the knob past the cap line left it sitting out there: the build was
    // never wrong, but the control stopped agreeing with the bar it sits on.
    const el = attrEls[i];
    const resync = () => {
      if (!el) return;
      el.range.value = state.values[i];
      // The number field is left alone while it has focus, so a resync cannot eat a half-typed
      // value out from under the cursor.
      if (document.activeElement !== el.num) el.num.value = state.values[i];
    };
    // An empty or unparseable field is not a request for anything. Number("") is 0, which is finite
    // and clamps up to the floor, so a select-all-delete used to read as "set this to 25" and take
    // the carried request with it.
    const raw = String(v).trim();
    if (raw === "") { resync(); return; }
    const asked = Math.round(Number(raw));
    if (!Number.isFinite(asked)) { resync(); return; }
    // The guard has to test where the value LANDS, not what was typed. Comparing the raw input
    // against the display let anything above the cap through: it differs from the display, passes,
    // then clamps straight back onto it, overwriting a much larger carried request with the number
    // already on screen. Same silent destruction the guard was added to stop, one clamp later.
    const landed = clamp(asked, FLOOR, ceilingFor(i));
    // A value that lands on the number already displayed leaves the row looking exactly as it did,
    // so it asked for nothing visible and must not change the hidden request either. That cuts both
    // ways: a cap can hold the display BELOW the request, and a linked minimum can hold it ABOVE,
    // and writing the display back destroys points in the first case and commits points the user
    // never asked for in the second.
    if (landed === state.values[i]) { resync(); return; }
    setWant(i, asked);
  }
  // Click steps once; press and hold repeats. Pointer capture keeps the repeat tied to this button
  // so releasing anywhere, or the button going disabled at the cap, always stops it.
  function bindStep(btn, i, delta) {
    let hold = null, repeat = null, touchPending = false;
    const stop = () => { clearTimeout(hold); clearInterval(repeat); hold = repeat = null; touchPending = false; };
    const fire = () => {
      // Stop the repeat when the value stops moving, whether that is the cap, the floor, or the
      // budget lock refusing the next point. Without the budget case the repeat spins on forever
      // against a value that cannot change.
      const before = state.values[i];
      touchPending = false;   // the hold has taken over, so the release must not add one more
      if (before === clamp(before + delta, FLOOR, ceilingFor(i))) { stop(); return; }
      step(i, delta);
      if (state.values[i] === before) stop();
    };
    btn.addEventListener("pointerdown", e => {
      // Primary button only. A right or middle press used to step the attribute, and the click
      // listener below could not undo it, because a non-primary press fires auxclick and
      // contextmenu rather than click. Touch and pen report button 0 too, so this does not
      // exclude them.
      if (btn.disabled || (e.button !== undefined && e.button !== 0)) return;
      e.preventDefault();
      // On a mouse the value commits on press, which is what makes press-and-hold work. On touch
      // that means a finger landing on the button commits before it is a tap at all, so a page
      // scroll started with a thumb over a stepper both scrolled and changed the build. Touch waits
      // for the release instead; the hold repeat still arms, so press-and-hold is unaffected.
      //
      // The flag has to be SET here. It was added with the release path but never assigned, so on
      // touch pointerdown skipped the step, the release found the flag false, and every tap on the
      // page's primary control did nothing at all. Phones are a supported width and nobody noticed,
      // because nothing automated presses a button with a finger.
      // Cancel whatever is already armed before arming again. Assigning over `hold` left the
      // previous timeout running with nothing holding a reference to it, so a second finger on the
      // same button orphaned the first one: it fired 400ms later, started the 70ms repeat, and
      // walked the attribute towards its cap with every finger long since off the screen. Measured
      // at 61 to 90 in two and a half seconds, untouched.
      stop();
      if (e.pointerType === "touch") touchPending = true;
      else step(i, delta);
      hold = setTimeout(() => { repeat = setInterval(fire, 70); }, 400);
    });
    // Registered before stop, which clears the flag: a completed tap is down then up on the same
    // button, and that is the point at which touch commits.
    btn.addEventListener("pointerup", () => {
      if (touchPending && !btn.disabled) step(i, delta);
      touchPending = false;
    });
    ["pointerup", "pointercancel", "pointerleave", "blur"].forEach(ev => btn.addEventListener(ev, stop));
    // Everything that is not a pointer press arrives here. e.detail is the click count, and it is 0
    // exactly when nothing pointed at the button: keyboard Enter and Space on a native button,
    // screen-reader browse-mode activation, and voice control ("click Raise Close Shot"). Those
    // paths used to reach nothing at all, because pointerdown was the only listener, which left the
    // primary control of this page unusable on them. A real mouse or touch click reports detail 1
    // and has already stepped on pointerdown, so it is ignored here rather than counted twice.
    btn.addEventListener("click", e => {
      if (btn.disabled) return;
      // detail is 0 exactly when nothing pointed at the button: keyboard Enter and Space on a
      // native button, screen-reader browse-mode activation, voice control. Mouse and touch both
      // report detail 1 and have already stepped, on press and on release respectively.
      if (e.detail !== 0) return;
      step(i, delta);
    });
  }

  // ---------- recompute everything ----------
  function recompute() {
    const caps = capsFor(state.h, state.ws, state.w);
    state.caps = caps;
    if (!caps) { $("ovrHint").textContent = "That body is outside the caps data."; return; }
    const n = normalize(state.want, caps, state.h);
    state.values = n.values; state.forced = n.forced; state.limited = n.limited;
    const ovr = MODEL.overall(state.h, state.values);
    state.ovr = ovr;
    const tok = tokenCounts(state.values, state.h);
    state.tokens = tok;
    renderAttrs(caps, tok);
    renderOverall(ovr);
    renderTab();
    saveToHash();
  }

  function renderAttrs(caps, tok) {
    const ladders = MODEL.tokenLadders(state.h);
    // Whether ANY attribute can still take a point. The overall jumps when the archetype flips, so
    // a build can show "0.4 left" and still have nothing it can spend that 0.4 on. Saying "budget
    // left" there would be dangling a point the build cannot actually buy.
    let roomLeft = false;
    for (let i = 0; i < 21; i++) {
      const el = attrEls[i], cap = Math.min(99, caps[i]), v = state.values[i];
      el.range.max = 99; el.range.value = v; el.num.value = v; el.num.max = cap; el.num.min = 25;
      el.cap.textContent = cap;
      // Two different limits can stop a raise, and the user needs to be able to tell them apart:
      // the cap is a property of the body and will not move, the budget is a property of the rest
      // of the build and moves the moment something else comes down. One probe per attribute, not
      // a full search, since all we need to know here is whether the next point is affordable.
      const atCap = v >= cap;
      const atBudget = !atCap && state.lockBudget && !affordable(i, v + 1);
      el.up.disabled = atCap || atBudget || !stepMoves(i, +1);
      el.down.disabled = !stepMoves(i, -1);
      el.row.classList.toggle("atcap", atCap);
      el.row.classList.toggle("atbudget", atBudget);
      if (!atCap && !atBudget) roomLeft = true;
      const p = ((v - 25) / 74 * 100).toFixed(2) + "%", cp = ((cap - 25) / 74 * 100).toFixed(2) + "%";
      el.range.style.setProperty("--p", p); el.range.style.setProperty("--cp", cp);
      el.capline.style.left = `calc(7px + (100% - 14px) * ${(cap - 25) / 74})`;
      el.row.classList.toggle("forced", state.forced.has(i));
      el.forced.textContent = state.forced.has(i) ? `raised to ${v} by a linked attribute`
        : state.limited.has(i) ? `held at ${v} by a linked cap`
        : atBudget ? "no budget left for the next point" : "";
      // ticks: token thresholds for this attribute
      const lad = ladders && ladders[i];
      el.ticks.innerHTML = lad && lad.d !== null ? lad.t.filter(t => t <= cap).map(t => `<i class="tok" style="left:${((t - 25) / 74 * 100).toFixed(2)}%" title="token at ${t}"></i>`).join("") : "";
      // next unlock text
      el.next.innerHTML = nextUnlockText(i, v, cap, lad);
      // The meta line is a fixed height so the row cannot move, which means very narrow screens can
      // clip it. Carrying the same text in the tooltip keeps it recoverable rather than lost.
      const meta = el.next.parentElement;
      if (meta) meta.title = meta.textContent.replace(/\s+/g, " ").trim();
    }
    state.roomLeft = roomLeft;
    DISCS.forEach((d, di) => {
      // Count only the thresholds this body can actually reach. The tick marks under each slider
      // already stop at the cap, so counting every threshold in the ladder put a denominator on the
      // panel that disagreed with the marks right below it, and promised tokens no build at this
      // height could ever collect.
      const totalPossible = ladders ? d.idx.reduce((s, i) => {
        const lad = ladders[i];
        if (!lad || lad.d === null) return s;
        const cap = Math.min(99, caps[i]);
        return s + lad.t.filter(t => t <= cap).length;
      }, 0) : 0;
      const have = tok.known ? tok.perDisc[di] : null;
      const tokEl = document.querySelector(`[data-tok="${di}"]`), txt = document.querySelector(`[data-disc-tokens="${di}"]`);
      if (tok.known) {
        tokEl.innerHTML = Array.from({ length: totalPossible }, (_, k) => `<i class="${k < have ? "on" : ""}"></i>`).join("");
        txt.innerHTML = `<b>${have}</b> / ${totalPossible} badge tokens`;
      } else {
        tokEl.innerHTML = ""; txt.innerHTML = `<span title="Token thresholds for this height are not in the dataset yet">tokens: no data for ${ft(state.h)}</span>`;
      }
    });
  }

  function nextUnlockText(i, v, cap, lad) {
    const out = [];
    // next badge threshold that involves this attribute
    let bestBadge = null;
    // Guarded because this runs on every recompute, not only on the Badges tab. Unguarded, a
    // blocked data/badges.js threw on every edit anywhere on the page, which stopped saveToHash and
    // quietly discarded the build on refresh. The tab itself explains the missing file; the
    // attribute rows simply go without their next-badge hint.
    for (const b of (window.BADGES ? BADGES.list : [])) {
      if (state.h < b.minH || state.h > b.maxH) continue;
      // What the build already has. An OR badge can be at Gold on a different attribute entirely,
      // and the hint used to offer Bronze on this one, which contradicted the Badges panel on the
      // same screen. Only a tier ABOVE what is already held is news.
      const held = badgeTier(b, state.values, state.h).tier;
      for (const r of b.reqs) {
        if (r.attr !== i) continue;
        for (let t = 0; t < 4; t++) {
          const th = r.tiers[t];
          if (th === null || th <= v || th > cap || t + 1 <= held) continue;
          // for AND badges the other requirements have to be met already, or the hint is noise
          const othersOk = b.logic !== "AND" || b.reqs.every(q => q.attr === i || (q.tiers[t] !== null && state.values[q.attr] >= q.tiers[t]));
          if (othersOk && (!bestBadge || th < bestBadge.th)) bestBadge = { th, name: b.name, tier: TIER_NAMES[t + 1] };
          break;
        }
      }
    }
    if (bestBadge) out.push(`<span>${bestBadge.th}: ${bestBadge.tier} ${bestBadge.name}</span>`);
    if (lad && lad.d !== null) {
      const nt = lad.t.find(t => t > v && t <= cap);
      if (nt) out.push(`<span>${nt}: +1 token</span>`);
    }
    return out.join("");
  }

  // How far past 99 a build has to land before the page calls it over budget.
  //
  // This was 1.5, sized to absorb a fitted model's error, and its comment justified the width on
  // two grounds that are both now false. The first was that the overall is an estimate carrying a
  // median error of about a tenth of a point: it is not an estimate any more, it is the game's own
  // formula, and held out against 360 engine captures it reproduces the reported overall exactly,
  // RMSE 0.000 and worst 0.00. The second was checkable and wrong even as written: it claimed six
  // of 2K's Signature Blueprints land inside the band, and not one of the forty exceeds 99.00.
  //
  // So the band absorbs nothing except float noise now, and while it stood the page told anyone who
  // turned the lock off that a build 1.4 points past the ceiling "fills the budget".
  const OVER_TOLERANCE = 0.01;
  // One decimal, always floored. Rounding a raw overall up next to a big number that floors it is
  // how "98" ended up beside "est. 99.0"; every place the same quantity is shown uses this.
  function floor1(x) { return (Math.floor(x * 10) / 10).toFixed(1); }
  function renderOverall(ovr) {
    const disp = $("ovrDisplay"), det = $("ovrDetail"), bar = $("ovrBar"), hint = $("ovrHint");
    const over = ovr.raw > 99 + OVER_TOLERANCE;
    const atCeiling = !over && ovr.raw >= 99;
    disp.textContent = ovr.display;
    // Floor the estimate to one decimal rather than rounding it. The big number is floor(raw), so a
    // raw of 98.96 was showing "98" beside "est. 99.0", which reads as a contradiction and is the
    // first thing anyone notices. The budget lock parks builds just under 99, right in that window,
    // so it happened on every maxed-out build.
    det.textContent = ovr.raw >= 99 ? "" : "est. " + floor1(ovr.raw);
    const pct = clamp((ovr.raw - 25) / 74 * 100, 0, 100);
    bar.querySelector("i").style.width = pct + "%";
    bar.classList.toggle("over", over);
    bar.classList.toggle("done", !over && ovr.display >= 99);
    if (over) {
      // Floored, like the Summary tab and like the big number. Rounding here put two different
      // values for the same quantity on the same screen.
      hint.innerHTML = `<span class="pill bad">Over budget</span> this build lands near <b class="num">${floor1(ovr.raw)}</b>, past the 99 ceiling. Lower something by roughly <b>${floor1(ovr.raw - 99)}</b> overall.`;
    } else if (atCeiling) {
      hint.innerHTML = `<span class="pill good">At the ceiling</span> this build fills the budget. It may sit a point either side of 99, so check the last upgrade in game.`;
    } else {
      const left = 99 - ovr.raw;
      if (state.lockBudget && state.roomLeft === false) {
        hint.innerHTML = `<span class="pill good">Budget spent</span> about <b class="num">${left.toFixed(1)}</b> is left on paper, but every attribute is at its cap or one point away from breaking 99, so there is nothing left to buy.`;
      } else {
        hint.innerHTML = `<span class="pill ${left < 0.6 ? "good" : "warn"}">${left < 0.6 ? "Budget filled" : "Budget left"}</span> about <b class="num">${left.toFixed(1)}</b> overall still to spend. Estimated, so confirm the last point or two in game.`;
      }
    }
    // The overall above is what this build can reach. If the player has told us where they are now,
    // say how far that leaves them from the build and from the 99 that unlocks Cap Breakers. This
    // lives in its own box rather than being appended to the hint, so the hint's height depends
    // only on the build. Appending it made the hint three lines tall and pushed every attribute row
    // down, and it would have done that on a redraw triggered by something else entirely.
    const now = $("ovrNow");
    if (now) {
      if (state.currentOvr === null) now.innerHTML = "";
      else if (over) {
        // The displayed overall is clamped at 99, so on an over-budget build "how far from this
        // build" reads as zero and the box announced you were already at its ceiling, directly
        // under a header saying the build is 14 points past the limit. There is no distance to a
        // build that cannot exist.
        now.innerHTML = `<span class="pill">Now ${state.currentOvr}</span> this build is over the ` +
          `99 ceiling, so there is nothing to be short of yet. Bring it under first.`;
      }
      else {
        const toBuild = Math.max(0, ovr.display - state.currentOvr);
        const toNinety = Math.max(0, 99 - state.currentOvr);
        now.innerHTML = `<span class="pill">Now ${state.currentOvr}</span> ` + (
          toBuild > 0
            ? `<b class="num">${toBuild}</b> overall from this build's ceiling`
            : `already at this build's ceiling`) +
          (toNinety > 0 ? ` &middot; <b class="num">${toNinety}</b> from the 99 that unlocks Cap Breakers` : ` &middot; Cap Breakers unlocked`);
      }
    }
  }

  // ---------- side tabs ----------
  // Every side tab rebuilds its whole panel with innerHTML, which throws away whatever had focus.
  // With a mouse that is invisible. With a keyboard it is not: tick "only badges this build
  // qualifies for" and focus lands back on <body>, so the next Tab restarts from the top of the
  // page. The animation search box carried a bespoke restore for exactly this. This is that restore,
  // generalised, so every panel keeps the caret and the focus ring where they were.
  function setPanel(el, html) {
    const a = document.activeElement;
    const inside = a && el && typeof el.contains === "function" && el.contains(a);
    const id = inside && a.id ? a.id : null;
    // Most of the controls in these panels have no id: cap-breaker chips, the animation accordion
    // toggles, the blueprint Load buttons. Matching on id alone meant every one of them dropped
    // focus to <body> on activation, which is the exact bug setPanel was added to fix. Their data
    // attributes identify them just as well, so a selector is built from those instead.
    let sel = null;
    if (inside && !id) {
      const d = a.dataset || {};
      const parts = ["cb", "k", "group", "bp", "tab"].filter(k => d[k] !== undefined)
        .map(k => `[data-${k}="${String(d[k]).replace(/"/g, '\\"')}"]`);
      if (parts.length) sel = a.tagName.toLowerCase() + parts.join("");
    }
    let caret = null;
    // selectionStart throws on a number input in some browsers, so it never gets to be a hard error.
    if (id) { try { caret = a.selectionStart; } catch (e) { caret = null; } }
    el.innerHTML = html;
    if (!id && !sel) return;
    let back = null;
    try {
      back = id ? (typeof document.getElementById === "function" ? document.getElementById(id) : null)
                : (typeof el.querySelector === "function" ? el.querySelector(sel) : null);
    } catch (e) { back = null; }
    if (!back || back === document.activeElement || typeof back.focus !== "function") return;
    try {
      back.focus({ preventScroll: true });
      if (caret !== null && typeof back.setSelectionRange === "function") back.setSelectionRange(caret, caret);
    } catch (e) { /* an element that will not take focus is not worth throwing over */ }
  }

  // A tab whose dataset did not load says so, instead of throwing.
  //
  // Only the Cap Breakers tab used to handle this. If data/animations.js failed, and it is the
  // largest request the page makes at 194KB, the page looked healthy until the user opened the
  // Animations tab. From then on EVERY edit threw inside renderTab, which meant saveToHash never
  // ran: the URL and localStorage silently stopped updating and a refresh discarded the build. The
  // user gets told, and the rest of the page keeps working.
  function withData(name, obj, el, render) {
    if (obj) {
      try { return render(); }
      catch (e) {
        setPanel(el, `<p class="note" style="color:var(--warn-ink)">This tab could not be drawn: ${String(e && e.message || e)}. Everything else on the page still works, and your build is safe.</p>`);
        return;
      }
    }
    setPanel(el, `<p class="note" style="color:var(--warn-ink)"><b>${name} did not load.</b> That file is fetched separately, so a blocked or interrupted request leaves this tab empty while the rest of the page works normally. Reload to try again; your build is kept in the address bar either way.</p>`);
  }
  function renderTab() {
    const t = state.tab;
    document.querySelectorAll("#tabs button").forEach(b => {
      const on = b.dataset.tab === t;
      b.setAttribute("aria-selected", String(on));
      b.setAttribute("tabindex", on ? "0" : "-1");   // roving tabindex: one stop for the whole strip
    });
    document.querySelectorAll(".tabpanel").forEach(p => p.hidden = p.id !== `tab-${t}`);
    if (t === "badges") withData("The badge data", window.BADGES, $("tab-badges"), renderBadges);
    if (t === "takeovers") withData("The takeover data", window.TAKEOVERS, $("tab-takeovers"), renderTakeovers);
    if (t === "anims") withData("The animation data", window.ANIMATIONS, $("tab-anims"), renderAnims);
    if (t === "capbreakers") withData("The cap breaker data", window.CAPBREAKERS, $("tab-capbreakers"), renderCapBreakers);
    if (t === "blueprints") withData("The blueprint data", window.BLUEPRINTS, $("tab-blueprints"), renderBlueprints);
    if (t === "summary") withData("The build data", window.MODEL, $("tab-summary"), renderSummary);
  }

  function renderBadges() {
    const el = $("tab-badges");
    const v = state.values, h = state.h;
    const rows = BADGES.list.map(b => ({ b, ...badgeTier(b, v, h) }));
    const counts = [0, 0, 0, 0, 0]; rows.forEach(r => counts[r.tier]++);
    const tokSpend = [0, 0, 0, 0, 0, 0];
    rows.forEach(r => { if (r.tier && r.b.tokenCost) tokSpend[DISCS.findIndex(d => d.key === r.b.cat)] += r.b.tokenCost[r.tier - 1]; });
    let html = `<div class="summary-row">
      <span class="tier t4"><span class="box"></span><span class="lbl">${counts[4]} HoF</span></span>
      <span class="tier t3"><span class="box"></span><span class="lbl">${counts[3]} Gold</span></span>
      <span class="tier t2"><span class="box"></span><span class="lbl">${counts[2]} Silver</span></span>
      <span class="tier t1"><span class="box"></span><span class="lbl">${counts[1]} Bronze</span></span>
    </div>
    <div class="ctl"><label><input type="checkbox" id="badgeOnly" ${state.badgeOnly ? "checked" : ""}> Only badges this build qualifies for</label></div>`;
    DISCS.forEach((d, di) => {
      const list = rows.filter(r => r.b.cat === d.key && r.eligible && (!state.badgeOnly || r.tier > 0));
      if (!list.length) return;
      list.sort((a, b) => b.tier - a.tier || a.b.name.localeCompare(b.b.name));
      const tokens = state.tokens.known ? state.tokens.perDisc[di] : null;
      const maxed = tokens !== null ? tokSpend[di] : null;
      html += `<div class="bcat" style="--c:${d.color};--ci:${d.ink}"><h3>${d.key}<small>${tokens !== null ? `${tokens} tokens earned &middot; ${maxed} to buy every tier unlocked` : "token data pending for this height"}</small></h3>`;
      html += list.map(r => {
        const cost = r.b.tokenCost ? r.b.tokenCost.map((c, k) => `<span class="${k + 1 <= r.tier ? "" : "lock"}">${c}</span>`).join("/") : "?";
        return `<div class="brow ${r.tier ? "" : "locked"}">
          <div class="bn">${r.b.name}<small>${r.b.reqs.map(q => SHORT[q.attr]).join(r.b.logic === "AND" ? " + " : " / ")}</small></div>
          <div><span class="tier t${r.tier}"><span class="box"></span><span class="lbl">${r.tier ? TIER_NAMES[r.tier] : "Locked"}</span></span><div class="req">${badgeNextText(r.b, v, r.tier)}</div></div>
          <div class="cost num" title="Token cost to reach Bronze / Silver / Gold / HoF (NBA2KLab estimate)"><b>${r.tier && r.b.tokenCost ? r.b.tokenCost[r.tier - 1] : "–"}</b> tok<br>${cost}</div>
        </div>`;
      }).join("");
      html += `</div>`;
    });
    const ineligible = rows.filter(r => !r.eligible).map(r => r.b.name);
    if (ineligible.length) html += `<p class="note">Not available at ${ft(h)}: ${ineligible.join(", ")}.</p>`;
    html += `<p class="note">Legend tier can't be bought with tokens in 2K27. It comes from the +1 / +2 Synergy boosts on top of Hall of Fame. Token costs are NBA2KLab's current table and may shift with patches.</p>`;
    setPanel(el, html);
    $("badgeOnly").addEventListener("change", e => { state.badgeOnly = e.target.checked; renderBadges(); });
  }

  function renderTakeovers() {
    const el = $("tab-takeovers"); const v = state.values;
    const groups = ["Shooting", "Finishing", "Playmaking", "Defense", "Rebounding", "Universal"];
    let html = "";
    groups.forEach(g => {
      const list = TAKEOVERS.list.filter(t => t.disc === g);
      html += `<div class="bcat" style="--c:${DISC_COLOR[g] || "var(--accent)"};--ci:${DISC_INK[g] || "var(--accent)"}"><h3>${g}</h3>`;
      html += list.map(t => {
        const met = t.logic === "ALWAYS" ? true : t.logic === "OR" ? t.reqs.some(([a, m]) => v[a] >= m) : t.reqs.every(([a, m]) => v[a] >= m);
        const req = t.logic === "ALWAYS" ? "Always available" : t.reqs.map(([a, m]) => `${SHORT[a]} ${v[a] >= m ? "✓" : `${v[a]}→<b>${m}</b>`}`).join(t.logic === "OR" ? " or " : " and ");
        const tag = t.isDefault ? `<span class="pill">Default</span> ` : "";
        return `<div class="trow ${met ? "" : "locked"}"><div class="tn">${t.name}<small>${t.desc}</small></div><div>${tag}<span class="pill ${met ? "good" : ""}">${met ? "Unlocked" : "Locked"}</span><div class="req st">${req}</div></div></div>`;
      }).join("");
      html += "</div>";
    });
    const multi = TAKEOVERS.list.filter(t => t.reqs.length > 1).length;
    html += `<p class="note">Each discipline has a Default takeover that needs nothing, and Hydration Hero fits any of the five slots.
      The ${multi} takeovers with more than one requirement need <b>all</b> of them, not one or the other. Requirements come from
      the table NBA2KLab ships with its takeover page. Hydration Hero carries no attribute requirement there, though some other
      write-ups say it unlocks through Takeover Progression rather than at build time.</p>`;
    setPanel(el, html);
  }

  // Escaping only the quote left every other character reference intact, so the browser decoded it
  // on the way in: type "&amp; pro" and the box came back reading "& pro" while the filter kept
  // running on what was actually typed. The ampersand has to go first or it re-escapes the others.
  function esc(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function animMeets(a) {
    const v = state.values, h = state.h;
    if (h < a.h[0] || h > a.h[1]) return { ok: false, why: `height ${ft(a.h[0])}–${ft(a.h[1])}` };
    // A jumper base carries one shooting-rating requirement rather than a named attribute, so it is
    // measured against whichever of Mid-Range and Three-Point is higher.
    if (a.r.length && a.r[0][0] === "jumper") {
      const need = a.r[0][1], best = Math.max(v[5], v[6]);
      return { ok: best >= need, why: `shooting ${need}` };
    }
    const checks = a.r.map(([i, m]) => ({ i, m, ok: v[i] >= m }));
    // An animation with no requirements has nothing to fail, whichever way its requirements would
    // have combined. This used to run through some/every, and [].some() is false while [].every()
    // is true, so the same empty list read LOCKED on an OR animation and UNLOCKED on an AND one:
    // 79 animations across Post Fade and Post Hop Shot were reported locked on every build at every
    // height, and the default "only what this build unlocks" filter hid both groups entirely, while
    // Post Hook next to them showed 13 of 13 on identical data.
    if (!checks.length) return { ok: true, why: "no requirement" };
    const ok = a.or ? checks.some(c => c.ok) : checks.every(c => c.ok);
    return { ok, why: checks.map(c => `${SHORT[c.i]} ${c.m}`).join(a.or ? " / " : " + ") };
  }

  function renderAnims() {
    const el = $("tab-anims");
    const sections = [["Dunks & layups", ANIMATIONS.finishing], ["Dribble moves & styles", ANIMATIONS.dribbling],
      ["Jump shots & post shots", ANIMATIONS.shooting], ["Jumper bases", ANIMATIONS.jumpers], ["Motion styles", ANIMATIONS.motion]];
    let html = `<div class="ctl"><input type="search" id="animSearch" aria-label="Search animations or players" placeholder="Search animations or players" value="${esc(state.animSearch)}"><label><input type="checkbox" id="animOnly" ${state.animOnly ? "checked" : ""}> Only what this build unlocks</label></div>`;
    const q = state.animSearch.trim().toLowerCase();
    sections.forEach(([title, list]) => {
      const groups = {};
      list.forEach(a => { (groups[a.g] = groups[a.g] || []).push(a); });
      html += `<h2 style="font-size:17px;margin:12px 0 2px;text-transform:uppercase;letter-spacing:.04em">${title}</h2>`;
      Object.keys(groups).sort().forEach(g => {
        const items = groups[g].map(a => ({ a, ...animMeets(a) })).filter(x => (!state.animOnly || x.ok) && (!q || x.a.n.toLowerCase().includes(q) || g.toLowerCase().includes(q)));
        const total = groups[g].length, unlocked = groups[g].filter(a => animMeets(a).ok).length;
        if (!items.length) return;
        const open = state.animOpen[g] ?? (!!q);
        html += `<div class="agroup"><h3><button type="button" class="agtoggle" data-group="${g.replace(/"/g, "&quot;")}" aria-expanded="${open}">${g}<small>${unlocked} of ${total} unlocked ${open ? "▾" : "▸"}</small></button></h3>`;
        if (open) html += `<div class="alist">${items.sort((x, y) => x.a.n.localeCompare(y.a.n)).map(x => `<div class="${x.ok ? "" : "lock"}"><span>${x.a.n}</span><span class="rq">${x.why}</span></div>`).join("")}</div>`;
        html += `</div>`;
      });
    });
    html += `<p class="note">Requirements from NBA2KLab's 2K27 animation dataset. A jumper base is checked against
      whichever of your Mid-Range and Three-Point is higher, since the base carries one shooting rating rather than a
      named attribute. NBA2KLab's own caveat applies: a finished jump shot is a base plus an upper release, and the
      release you pair with it changes the requirement.</p>`;
    // Re-rendering replaces the search box itself. setPanel is what puts focus and the caret back,
    // which is what keeps the field usable while you are typing into it.
    setPanel(el, html);
    const search = $("animSearch");
    search.addEventListener("input", e => { state.animSearch = e.target.value; renderAnims(); });
    $("animOnly").addEventListener("change", e => { state.animOnly = e.target.checked; renderAnims(); });
    el.querySelectorAll("button.agtoggle").forEach(h => h.addEventListener("click", () => { const g = h.dataset.group; state.animOpen[g] = !(state.animOpen[g] ?? !!q); renderAnims(); }));
  }

  // ---------- cap breakers ----------
  // Where the archetype/height pair was never measured, fall back to f = 1 - w/max(w):
  // the engine gives the attributes an archetype values least the biggest jumps.
  function fallbackF(i) {
    if (!MODEL.weightsFor) return null;
    const w = MODEL.weightsFor(state.ovr.type, state.h);
    if (!w) return null;
    const mx = Math.max.apply(null, w);
    return mx > 0 ? clamp(1 - w[i] / mx, 0, 1) : null;
  }
  function ladderFor(i) {
    if (!window.CAPBREAKERS) return null;
    return CAPBREAKERS.ladderFor(state.ovr.type, state.h, i, state.values[i], state.caps[i], fallbackF(i));
  }
  function plannedValues() {
    const out = state.values.slice();
    for (let i = 0; i < 21; i++) {
      const n = state.cbPlan[i]; if (!n) continue;
      const lad = ladderFor(i); if (!lad) continue;
      for (let k = 0; k < n; k++) out[i] += lad.gains[k];
      out[i] = Math.min(out[i], state.caps[i]);
    }
    return out;
  }
  // A planned breaker only counts if it actually moves the attribute. Changing the body or the
  // archetype can shorten a ladder underneath an existing plan, and a breaker that would add
  // nothing is not one you would ever spend.
  function productivePlan(i) {
    const n = state.cbPlan[i]; if (!n) return 0;
    const lad = ladderFor(i); if (!lad) return 0;
    let count = 0;
    for (let k = 0; k < n; k++) if (lad.gains[k] > 0) count++;
    return count;
  }
  // The shipped name for a player type carries a parenthetical listing the three attributes it
  // weights most: "Profile 9 (Three-Point, Ball Handle, Speed With Ball weighted)". That list is one
  // fixed string per type, but the weight table has a separate row for every height, and the top
  // three change with it. Scored against the table, the shipped parenthetical names the wrong three
  // at 203 of the 300 type/height pairs. So the profile number comes from the data and the three
  // attributes are read off the row that actually applies to this build.
  function typeLabel(t, h) {
    const base = MODEL.typeName(t);
    const stem = base.replace(/\s*\(.*\)\s*$/, "");
    const w = MODEL.weightRow ? MODEL.weightRow(t, h) : null;
    if (!w) return base;
    const top = w.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => ATTRS[i]);
    return `${stem} (${top.join(", ")} weighted)`;
  }
  // How many player types actually tie, and which. The old copy asserted all fifteen every time,
  // which is only true on a build where every attribute is level. On a real blueprint it is usually
  // two, and being told fifteen is both wrong and useless: with two named, you can see what they
  // disagree about.
  // Which of the tied types would actually give a different answer. At several heights two or three
  // player types carry byte-identical weight rows (12, 13 and 14 from 6'11" up; 13 and 14 at 5'9" to
  // 5'11"), so the engine picking one or another changes nothing: same overall, same cap-breaker
  // ladder. Warning about those was warning about a distinction that does not exist.
  function tiedList() {
    const t = (state.ovr && state.ovr.tiedWith) || [];
    const all = t.length ? t : [state.ovr ? state.ovr.type : 0];
    if (all.length < 2 || !MODEL.weightRow) return all;
    const seen = new Map();
    for (const ty of all) {
      const row = MODEL.weightRow(ty, state.h);
      const key = row ? row.join(",") : "?" + ty;
      if (!seen.has(key)) seen.set(key, ty);
    }
    return [...seen.values()];
  }
  // A tie only matters if the types in it disagree about something.
  function tieMatters() { return tiedList().length > 1; }
  // Which attributes the tied types actually weigh differently, biggest gap first. This is what
  // makes the warning actionable: the old copy told the reader to move "any attribute the two value
  // differently by as little as a point", which is usually too small a move to break a tie decided
  // at a hundredth of a point.
  function tieSplitAttrs() {
    const t = tiedList();
    if (t.length < 2 || !MODEL.weightRow) return [];
    const rows = t.map(x => MODEL.weightRow(x, state.h)).filter(Boolean);
    if (rows.length < 2) return [];
    const spread = [];
    for (let a = 0; a < 21; a++) {
      let lo = Infinity, hi = -Infinity;
      for (const r of rows) { if (r[a] < lo) lo = r[a]; if (r[a] > hi) hi = r[a]; }
      spread.push([hi - lo, a]);
    }
    return spread.sort((x, y) => y[0] - x[0]).filter(x => x[0] > 0).slice(0, 3).map(([, a]) => ATTRS[a]);
  }
  function tiedNames() {
    const t = tiedList();
    // Against the RAW tie list, not the deduplicated one. Nine of the twenty heights have fewer
    // than fifteen distinct weight rows, so a flat build there ties every type while the dedup
    // collapses them to thirteen or fourteen, the >= 15 test never fired, and the page answered
    // "what archetype is this" with a thousand-character run-on list of names.
    const raw = ((state.ovr && state.ovr.tiedWith) || []).length;
    if (raw >= 15 || t.length >= 15) return "all 15 player types";
    if (t.length > 4) return `${t.length} of the 15 player types`;
    const names = t.map(x => typeLabel(x, state.h));
    return names.length === 1 ? names[0]
      : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  function tieText() {
    const t = tiedList();
    const raw = ((state.ovr && state.ovr.tiedWith) || []).length;
    if (raw >= 15 || t.length >= 15) {
      // Only claim the build is level when it actually is. All fifteen types tying does not imply a
      // flat build, and at the nine heights where several types share a weight row it routinely
      // happens on builds whose attributes plainly vary, where "vary the attributes" is advice the
      // reader has already taken.
      const v = state.values || [];
      const level = v.length === 21 && Math.max.apply(null, v) - Math.min.apply(null, v) <= 1;
      return level
        ? "on a build where every attribute is level all 15 score the same, so there is no way to "
          + "tell which one you would get. Vary the attributes and this resolves."
        : "all 15 player types score within a hundredth of a point here, so the game could assign "
          + "any of them. Several of them weigh this height's attributes identically, so the choice "
          + "often makes no difference to the ladders; where it does, only a large change separates them.";
    }
    const n = tiedList().length;
    // No instruction to move "any attribute by a point", because that is usually not enough: the
    // types are within a hundredth of each other and a single point often separates them by less
    // than that, so the reader does the thing and the warning does not go away. Saying which
    // attributes they disagree about is the part that actually helps.
    const disagree = tieSplitAttrs();
    return `${tiedNames()} score within a hundredth of a point here, so the game could assign `
      + `${n === 2 ? "either" : "any of them"} and the ladders below would change with it. `
      + (disagree.length
          ? `They differ most on ${disagree.join(", ")}: moving those is what separates them, though it can take several points.`
          : `Varying the attributes separates them.`);
  }
  // How far apart the two candidate rule sets are AT THIS HEIGHT. The caveat used to quote an
  // eleven-height median at every borrowed height, which overstated it several times over at 5'10"
  // and 5'11" - the same class of error as the reassurance it replaced, pointing the other way.
  // Cheap enough to measure live: one normalise per sample against each rule set.
  let readAcrossCache = null;
  function readAcrossCost() {
    const h = state.h;
    // Keyed on the caps, not just the height. Every number below is computed from state.caps, which
    // is a function of height AND weight AND wingspan, so caching on height alone meant changing
    // the weight left the warning quoting the previous body's measurement as if it were this one's.
    const key = h + ":" + (state.caps ? state.caps.join(",") : "");
    if (readAcrossCache && readAcrossCache.key === key) return readAcrossCache;
    const measured = [];
    for (let k = 69; k <= 88; k++) if (MODEL.linkedMeasured(k)) measured.push(k);
    const src = MODEL.linkedSource(h);
    const others = measured.filter(m => m !== src);
    if (!others.length || !state.caps) return (readAcrossCache = { key, h, n: 0 });
    const other = others.reduce((b, m) => Math.abs(m - h) < Math.abs(b - h) ? m : b, others[0]);
    const A = MODEL.linkedRules(h), B = MODEL.linkedRules(other);
    // A deterministic sample, so the sentence does not change between two renders of one build.
    let seed = 1013904223 ^ h;
    const rnd = () => { seed = (Math.imul(seed ^ seed >>> 15, 1 | seed) + 0x6D2B79F5) >>> 0; return seed / 4294967296; };
    let diff = 0, n = 0, worstAttr = 0, worstOvr = 0;
    for (let k = 0; k < 160; k++) {
      const want = [];
      for (let i = 0; i < 21; i++) want.push(25 + Math.floor(rnd() * (Math.min(99, state.caps[i]) - 24)));
      const a = normalize(want, state.caps, h).values;
      const bRules = normalize(want, state.caps, h, B);
      const b = bRules.values;
      let d = 0;
      for (let i = 0; i < 21; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
      n++;
      if (d) {
        diff++;
        if (d > worstAttr) worstAttr = d;
        const od = Math.abs(MODEL.overall(h, a).raw - MODEL.overall(h, b).raw);
        if (od > worstOvr) worstOvr = od;
      }
    }
    return (readAcrossCache = { key, h, src, other, n, share: n ? diff / n : 0, worstAttr, worstOvr });
  }
  function renderCapBreakers() {
    const el = $("tab-capbreakers");
    const v = state.values, caps = state.caps;
    const used = state.cbPlan.reduce((a, b, i) => a + productivePlan(i), 0);
    // What the button offers to clear. This counts every chip that is actually selected, not just
    // the productive ones the header totals: a breaker the ladder has since made worthless is still
    // a selection the user made, and still something they need a way to drop.
    const planned = state.cbPlan.reduce((a, n) => a + n, 0);
    const after = plannedValues();
    const haveRule = !!window.CAPBREAKERS;
    const gained = after.reduce((s, x, i) => s + (x - v[i]), 0);
    let html = `<div class="cbsum">
      <div><div class="v num ${used > CB_TOTAL_NOW ? "over" : ""}">${used}</div><div class="l">Breakers planned</div></div>
      <div><div class="v num">+${gained}</div><div class="l">Attribute points gained</div></div>
      <div><div class="v num">${CB_TOTAL_NOW}<small style="font-size:14px;color:var(--muted)"> / ${CB_TOTAL_YEAR}</small></div><div class="l">Earnable now / this year</div></div>
    </div>
    <div class="ctl" style="margin:0 0 6px"><button class="btn" id="clearPlan" type="button"${planned ? "" : " disabled"} title="${planned ? `Unplan all ${planned} breaker${planned > 1 ? "s" : ""}. Your attributes and the rest of the build are left alone.` : "Nothing planned yet"}">Clear plan${planned ? ` (${planned})` : ""}</button></div>
    <p class="note" style="margin:0 0 6px">Cap Breakers unlock once a build reaches 99 overall. Each chip is one breaker on that attribute, up to five, showing the points it adds from where the attribute sits now. Click a chip to plan that many. Gains stop at the body cap and at 99, and never earn badge tokens.</p>` +
      (state.ovr.tied && tieMatters() ? `<p class="note" style="margin:0 0 6px;color:var(--warn)"><b>These ladders are a guess on this build.</b> The gain depends on which of the 15 player types the game assigns, and ${tieText()}</p>` : "");
    if (state.currentOvr !== null && state.currentOvr < 99) {
      html += `<p class="note" style="color:var(--warn-ink)"><b>Not unlocked yet.</b> Your MyPLAYER is ${state.currentOvr} overall and Cap Breakers open at 99, ${99 - state.currentOvr} away. Everything below is what you would get once you are there.</p>`;
    }
    if (!haveRule) {
      html += `<p class="note">The cap-breaker data file did not load, so there are no ladders to show. Reload the page; if it persists, the deploy is incomplete.</p>`;
      setPanel(el, html); return;
    }
    DISCS.forEach((d) => {
      html += `<div class="bcat" style="--c:${d.color};--ci:${d.ink}"><h3>${d.key}</h3>`;
      d.idx.forEach(i => {
        const res = ladderFor(i) || { gains: [0, 0, 0, 0, 0], src: "no data" };
        const lad = res.gains;
        // The header counts only breakers that actually move the attribute, so the row has to as
        // well, or the same plan reads as two different numbers on the same screen.
        const n = state.cbPlan[i], prod = productivePlan(i);
        let cur = v[i]; const chips = [];
        for (let k = 0; k < 5; k++) {
          const g = lad[k]; const cls = ["chip"];
          if (g <= 0) cls.push("locked"); else if (k < n) cls.push("on"); else if (k === n) cls.push("next");
          const label = g > 0 ? `Cap breaker ${k + 1} on ${SHORT[i]}: +${g}, ${cur} to ${cur + g}` : `${SHORT[i]} has nothing left to gain`;
          chips.push(`<span class="${cls.join(" ")}" data-cb="${i}" data-k="${k}"${g > 0 ? ' role="button" tabindex="0"' : ' aria-disabled="true"'} aria-pressed="${k < n}" title="${label}" aria-label="${label}">${g > 0 ? "+" + g : "–"}</span>`);
          cur += Math.max(0, g);
        }
        const maxed = v[i] >= caps[i];
        html += `<div class="cbrow ${maxed ? "maxed" : ""}"><div class="cn">${SHORT[i]}<small>now ${v[i]} · cap ${caps[i]}</small></div><div class="chips">${chips.join("")}</div><div class="after"><b>${after[i]}</b><small>${prod ? `after ${prod} breaker${prod > 1 ? "s" : ""}` : (maxed ? "at cap" : "no breakers")}</small></div></div>`;
      });
      html += `</div>`;
    });
    // what the plan changes: badges and takeovers
    if (used) {
      const badgeList = window.BADGES ? BADGES.list : [];
      const before = badgeList.map(b => badgeTier(b, v, state.h).tier);
      const post = badgeList.map(b => badgeTier(b, after, state.h).tier);
      const changes = badgeList.map((b, k) => ({ b, from: before[k], to: post[k] })).filter(x => x.to > x.from);
      const tk = (window.TAKEOVERS ? TAKEOVERS.list : []).filter(t => t.logic !== "ALWAYS").map(t => {
        const met = (r) => t.logic === "OR" ? t.reqs.some(([a, m]) => r[a] >= m) : t.reqs.every(([a, m]) => r[a] >= m);
        return { t, from: met(v), to: met(after) };
      }).filter(x => x.to && !x.from);
      html += `<h3 style="margin:12px 0 4px;font-size:16px">What this plan unlocks</h3>`;
      if (!changes.length && !tk.length) html += `<p class="note" style="margin:0">No new badge tiers or takeovers. The points still raise the attributes themselves.</p>`;
      html += `<div class="gainlist">${changes.map(x => `<div class="g"><span>${x.b.name}</span><span>${TIER_NAMES[x.from] || "Locked"} → <b>${TIER_NAMES[x.to]}</b></span></div>`).join("")}${tk.map(x => `<div class="g"><span>${x.t.name} takeover</span><span>Locked → <b>Unlocked</b></span></div>`).join("")}</div>`;
    }
    // Every ladder now comes from the same weight table the overall uses, so there is no longer a
    // "measured here" versus "read across from a nearby height" distinction to draw.
    html += `<p class="note">The gain is not a fitted number. It comes from the same weight table
      the overall rating uses, which is 2K's own: one breaker adds <b>max(1, round(f &times; E))</b>
      points, where E falls from 15 at rating 25 to 2 near 99, and <b>f</b> is how little your
      archetype values that attribute. So your best attributes move a single point and your
      weakest move the most, which is how 2K describes it. Against 30,932 ladders captured from
      the engine this is exact 99.96% of the time. Confirm a final build in the NBA 2K HQ app
      before spending one: at 99 overall the in-game Builder Glossary shows the real numbers.</p>`;
    setPanel(el, html);
    const clearBtn = $("clearPlan");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (!state.cbPlan.some(n => n)) return;
        state.cbPlan = Array(21).fill(0);
        // recompute rather than renderCapBreakers, because the plan feeds the summary tab too.
        recompute();
      });
    }
    el.querySelectorAll("[data-cb]").forEach(chip => {
      const toggle = () => {
        const i = +chip.dataset.cb, k = +chip.dataset.k;
        // A chip goes locked once its gain is 0, which happens as soon as the attribute reaches its
        // cap. Refusing every click there would strand a plan the user can no longer clear, so a
        // locked chip can still cut the plan back to it.
        if (chip.classList.contains("locked")) {
          if (state.cbPlan[i] > k) { state.cbPlan[i] = k; renderCapBreakers(); }
          return;
        }
        state.cbPlan[i] = (state.cbPlan[i] === k + 1) ? k : k + 1;
        renderCapBreakers();
      };
      chip.addEventListener("click", toggle);
      chip.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); }
      });
    });
  }

  function renderBlueprints() {
    const el = $("tab-blueprints");
    let html = `<p class="note" style="margin-top:0">2K's 40 Signature Blueprints. Load one to copy its body and starting ratings, then raise attributes toward the caps.</p>`;
    POSITIONS.forEach(p => {
      const list = BLUEPRINTS.list.filter(b => b.pos === p);
      html += `<div class="bcat" style="--c:var(--accent);--ci:var(--accent)"><h3>${POS_NAME[p]}</h3>` + list.map((b, k) => `
        <div class="bp"><div><b>${b.name}</b> <span class="d">${ft(b.h)} · ${b.w} lb · ${ft(b.ws)} wingspan · best at ${b.skill}</span><div class="d">${b.desc}</div><div class="d">Compares to ${b.comps.join(", ")}</div></div>
        <button class="btn" data-bp="${b.id}">Load</button></div>`).join("") + `</div>`;
    });
    setPanel(el, html);
    el.querySelectorAll("[data-bp]").forEach(btn => btn.addEventListener("click", () => loadBlueprint(btn.dataset.bp)));
  }

  function loadBlueprint(id) {
    const b = BLUEPRINTS.list.find(x => x.id === id); if (!b) return;
    state.pos = b.pos; state.h = b.h; state.w = b.w; state.ws = b.ws;
    syncBodyForm();
    state.want = b.start.slice();
    state.cbPlan = Array(21).fill(0);   // a plan made for another build means nothing here
    recompute();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderSummary() {
    const el = $("tab-summary");
    const v = state.values, caps = state.caps, tok = state.tokens;
    const spent = v.reduce((s, x) => s + (x - 25), 0);
    const room = caps.reduce((s, c, i) => s + (c - v[i]), 0);
    const code = encodeBuild();
    let html = `<div class="stat">
      <div><div class="v num">${state.ovr.display}</div><div class="l">Overall potential</div></div>
      <div><div class="v num">${spent}</div><div class="l">Points above 25</div></div>
      <div><div class="v num">${room}</div><div class="l">Points of cap room</div></div>
    </div>
    <dl class="kv">
      <dt>Body</dt><dd>${POS_NAME[state.pos]} · ${ft(state.h)} · ${state.w} lb · ${ft(state.ws)} wingspan</dd>
      <dt>Current OVR</dt><dd>${state.currentOvr === null ? "not set"
        : state.ovr.raw > 99 + OVER_TOLERANCE
          ? `${state.currentOvr}, and this build is over the 99 ceiling, so there is nothing to be short of yet`
          : `${state.currentOvr}, ${Math.max(0, state.ovr.display - state.currentOvr)} short of this build and ${Math.max(0, 99 - state.currentOvr)} from Cap Breakers`}</dd>
      <dt>Archetype</dt><dd title="The game scores this build under all 15 player types and keeps the highest, and so does this page. On builds where the attributes actually vary it matches the engine 99.9% of the time.">${state.ovr.tied && tieMatters() ? `<span style="color:var(--warn)">too close to call</span> <span style="color:var(--muted)">(${tiedNames()} score the same here, so the game could pick any of them, and the ladders on the Cap Breakers tab would change with it)</span>` : `${typeLabel(state.ovr.type, state.h)} <span style="color:var(--muted)">(highest scoring of the 15)</span>`}</dd>
      <dt>Raw potential</dt><dd class="num">about ${floor1(state.ovr.raw)} (the game rounds a finished build up to 99 once nothing can be raised)</dd>
      <dt>Tokens</dt><dd>${tok.known ? DISCS.map((d, i) => `${d.key} ${tok.perDisc[i]}`).join(" · ") : "no ladder data for this height yet"}</dd>
    </dl>
    <h3 style="margin:12px 0 4px;font-size:16px">Attribute sheet</h3>
    <div class="kv" style="grid-template-columns:auto auto auto;">${DISCS.map(d => d.idx.map(i => `<dt>${ATTRS[i]}</dt><dd class="num"><b>${v[i]}</b></dd><dd class="num" style="color:var(--muted)">cap ${caps[i]}</dd>`).join("")).join("")}</div>
    <h3 style="margin:12px 0 4px;font-size:16px">Share</h3>
    <p class="note" style="margin:0 0 6px">The page link updates as you edit. This code holds the same build:</p>
    <textarea readonly id="buildCode" aria-label="Build share code">${code}</textarea>
    <div class="ctl" style="margin-top:6px"><button class="btn" id="copyCode">Copy code</button><input type="text" id="pasteCode" aria-label="Paste a build code" placeholder="Paste a build code" style="flex:1;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:6px 8px"><button class="btn" id="loadCode">Load</button></div>
    <h3 style="margin:14px 0 4px;font-size:16px">How the numbers are built</h3>
    <p class="note" style="margin:0">Caps are the game engine's values for this exact height, weight and wingspan, from NBA2KLab's caps data and spot-checked against Locker Codes on a dozen bodies across ten heights. Linked minimums and badge-token ladders come from Locker Codes engine captures. ${MODEL.notes}</p>
    ${MODEL.linkedMeasured && !MODEL.linkedMeasured(state.h) ? (() => {
      const c = readAcrossCost();
      const pct = Math.round(c.share * 100);
      // The framing has to consider both numbers it is about to print. Choosing "as much as" or
      // "at most" from the attribute gap alone wrapped reassuring words around a large overall gap
      // whenever the two disagreed, which is the combination that matters most to a reader.
      const ovrTxt = (Math.floor(c.worstOvr * 10) / 10).toFixed(1);
      const big = c.worstAttr >= 10 || c.worstOvr >= 1.0;
      const size = c.worstAttr === 0 ? `though never by more than rounding`
        : big ? `by as much as ${c.worstAttr} attribute points and ${ovrTxt} overall`
        : `though by at most ${c.worstAttr} attribute points and ${ovrTxt} overall`;
      return `<p class="note" style="margin:6px 0 0;color:var(--warn-ink)"><b>Linked minimums at ${ft(state.h)} are borrowed.</b> They were captured at ${ft(c.src)}, the nearest of the nine heights that were. Measured at this height: using ${ft(c.other)}'s rules instead changes the finished build on <b>${pct}%</b> of random builds, ${size}. Which way the real rules fall at ${ft(state.h)} is unknown, because ${ft(state.h)} was never captured. Every other number on this page is unaffected; treat the values a link forces up here as approximate.</p>`;
    })() : ""}
    <p class="note" style="margin:6px 0 0"><b>Where these numbers come from.</b> The overall rating, the archetype and the Cap Breaker gains use 2K's own tuning tables, extracted from the NBA 2K HQ companion app and published by souledxxout. Against 1,553 builds captured from a third-party builder they reproduce the reported overall to within a hundredth of a point on every one, which is why they are trusted here. The caps, badge tiers and token budgets around them come from NBA2KLab and Locker Codes, and Locker Codes says of its own builder that it is \"still being tested, and its numbers have not yet been verified for accuracy\". None of it has been checked against the retail game. Once a build reaches 99 overall the in-game Builder Glossary, and the NBA 2K HQ app, show the real Cap Breaker gain per attribute: that is first-party and worth checking before you spend.</p>`;
    setPanel(el, html);
    $("copyCode").addEventListener("click", () => { navigator.clipboard && navigator.clipboard.writeText(code); $("copyCode").textContent = "Copied"; setTimeout(() => $("copyCode").textContent = "Copy code", 1200); });
    $("loadCode").addEventListener("click", () => { if (decodeBuild($("pasteCode").value.trim())) { syncBodyForm(); recompute(); } });
  }

  // ---------- body form ----------
  function fillHeights() {
    const sel = $("height"); sel.innerHTML = "";
    Object.keys(BODIES[state.pos]).map(Number).sort((a, b) => a - b).forEach(h => {
      const o = document.createElement("option"); o.value = h; o.textContent = ft(h); sel.appendChild(o);
    });
  }
  function fillWings() {
    const sel = $("wing"); sel.innerHTML = "";
    const r = bodyRange();
    for (let ws = r.ws[0]; ws <= r.ws[1]; ws++) { const o = document.createElement("option"); o.value = ws; o.textContent = ft(ws); sel.appendChild(o); }
  }
  function syncBodyForm() {
    $("pos").value = state.pos;
    fillHeights();
    const hs = Object.keys(BODIES[state.pos]).map(Number);
    if (!hs.includes(state.h)) state.h = hs.includes(75) ? 75 : hs[Math.floor(hs.length / 2)];
    $("height").value = state.h;
    const r = bodyRange();
    state.w = clamp(state.w, r.w[0], r.w[1]);
    $("weight").min = r.w[0]; $("weight").max = r.w[1]; $("weight").value = state.w;
    $("weight").title = `${r.w[0]}–${r.w[1]} lb at ${ft(state.h)}`;
    fillWings();
    state.ws = clamp(state.ws, r.ws[0], r.ws[1]);
    $("wing").value = state.ws;
    const cur = $("curOvr");
    if (cur && document.activeElement !== cur) cur.value = state.currentOvr === null ? "" : state.currentOvr;
  }
  function bindBodyForm() {
    const posSel = $("pos");
    POSITIONS.forEach(p => { const o = document.createElement("option"); o.value = p; o.textContent = `${p} · ${POS_NAME[p]}`; posSel.appendChild(o); });
    posSel.addEventListener("change", () => { state.pos = posSel.value; syncBodyForm(); recompute(); });
    $("height").addEventListener("change", () => { state.h = +$("height").value; syncBodyForm(); recompute(); });
    $("weight").addEventListener("change", () => { state.w = +$("weight").value; syncBodyForm(); recompute(); });
    $("wing").addEventListener("change", () => { state.ws = +$("wing").value; recompute(); });
    $("curOvr").addEventListener("input", e => {
      const raw = e.target.value.trim();
      const n = Math.round(Number(raw));
      state.currentOvr = raw === "" || !Number.isFinite(n) ? null : clamp(n, 25, 99);
      try {
        if (state.currentOvr === null) localStorage.removeItem("buildlab.currentOvr");
        else localStorage.setItem("buildlab.currentOvr", String(state.currentOvr));
      } catch (e2) { /* private window, or site data blocked: it just will not persist */ }
      recompute();
    });
    // The lock is a preference about how you work, not a property of the build, so it is remembered
    // per browser and deliberately kept out of the share code: a link should describe a build, not
    // reach into how the person opening it likes to edit.
    // Same reasoning for where the player is now: remembered per browser, never in the code.
    try {
      const cov = localStorage.getItem("buildlab.currentOvr");
      const covN = cov === null ? NaN : Math.round(Number(cov));
      if (Number.isFinite(covN)) state.currentOvr = clamp(covN, 25, 99);
    } catch (e) { /* nothing saved, or storage is unavailable */ }
    const lock = $("lockBudget");
    try {
      const saved = localStorage.getItem("buildlab.lockBudget");
      if (saved !== null) state.lockBudget = saved === "1";
    } catch (e) { /* private window, or site data blocked: the default stands */ }
    lock.checked = state.lockBudget;
    lock.addEventListener("change", e => {
      state.lockBudget = e.target.checked;
      try { localStorage.setItem("buildlab.lockBudget", state.lockBudget ? "1" : "0"); } catch (e2) { /* nothing to do */ }
      recompute();
    });
    // Which build this is. The data fingerprint matters more than the version number: it moves
    // whenever caps, the model or the cap-breaker table change, so a stale cache showing old
    // numbers under a current version number cannot hide.
    const stampEl = $("buildStamp");
    if (stampEl && window.BUILD) {
      stampEl.innerHTML = `v<b>${BUILD.version}</b> \u00b7 built ${BUILD.built} \u00b7 data ${BUILD.data}`;
      stampEl.title = "Page version, build date, and a fingerprint of the shipped data files.";
    }
    $("resetBtn").addEventListener("click", () => { state.want = Array(21).fill(25); state.cbPlan = Array(21).fill(0); recompute(); });
    const tabs = [...document.querySelectorAll("#tabs button")];
    tabs.forEach((b, k) => {
      b.addEventListener("click", () => { state.tab = b.dataset.tab; renderTab(); });
      b.addEventListener("keydown", e => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        let target = null;
        if (step) target = tabs[(k + step + tabs.length) % tabs.length];
        else if (e.key === "Home") target = tabs[0];
        else if (e.key === "End") target = tabs[tabs.length - 1];
        if (!target) return;
        e.preventDefault();
        state.tab = target.dataset.tab; renderTab(); target.focus();
      });
    });
  }

  // ---------- share codes ----------
  const A36 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_!*'()~.:;=+@$,";
  function encodeBuild() {
    const attrs = state.want.map(v => A36[v - 25]).join("");
    // Where your MyPLAYER is right now is a fact about you, not about the build, so it stays out of
    // the code for the same reason the budget lock does. It used to ride along as a -cNN suffix,
    // which meant handing someone a link told them, in the second person, how far along the sharer
    // was. Old codes carrying the suffix still parse, and the number in them is now ignored.
    return `${state.pos}-${state.h}-${state.w}-${state.ws}-${attrs}`;
  }
  function decodeBuild(code) {
    // The attribute block is exactly 21 characters, so the optional suffix can never be mistaken
    // for part of it even though '-' is a legal attribute character.
    const m = /^(PG|SG|SF|PF|C)-(\d+)-(\d+)-(\d+)-([\s\S]{21})(?:-c(\d+))?$/.exec(code || "");
    if (!m) return false;
    const pos = m[1], h = +m[2], w = +m[3], ws = +m[4];
    if (!BODIES[pos] || !BODIES[pos][String(h)]) return false;
    const want = Array.from(m[5], ch => { const k = A36.indexOf(ch); return k < 0 ? 25 : 25 + k; });
    state.pos = pos; state.h = h; state.w = w; state.ws = ws; state.want = want;
    // A cap-breaker plan is about one specific build: same chip, different gain, different ladder
    // length. Loading a code used to carry the old plan onto the new build, which inflated both
    // "Breakers planned" and "Attribute points gained" for a plan the user never made here. The
    // blueprint loader already cleared it; this is the other way in.
    state.cbPlan = Array(21).fill(0);
    return true;
  }
  let hashTimer = null;
  function saveToHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const code = encodeBuild();
      history.replaceState(null, "", "#" + code);
      try { localStorage.setItem("2k27-build-lab", code); } catch (e) { /* storage may be unavailable */ }
    }, 150);
  }

  // The sidebar sticks below the header, and the header changes height as the body form wraps.
  // A hard-coded offset let the header cover the tab strip at some widths, which made the tabs
  // unclickable, so the real measured height is published as --top-h instead.
  function trackHeaderHeight() {
    const top = document.querySelector(".top");
    if (!top || typeof top.getBoundingClientRect !== "function" || !document.documentElement) return;
    const apply = () => {
      const h = Math.ceil(top.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty("--top-h", h + 8 + "px");
    };
    apply();
    if (typeof ResizeObserver === "function") new ResizeObserver(apply).observe(top);
    else window.addEventListener("resize", apply);
  }

  // ---------- boot ----------
  function boot() {
    buildAttrColumn();
    bindBodyForm();
    let loaded = false;
    if (location.hash.length > 1) {
      // A malformed percent-escape makes decodeURIComponent throw, which would abort boot and
      // leave the page completely blank. A bad link should cost you the shared build, nothing more.
      let raw = location.hash.slice(1);
      try { raw = decodeURIComponent(raw); } catch (e) { /* use it as-is */ }
      loaded = decodeBuild(raw);
    }
    if (!loaded) { try { loaded = decodeBuild(localStorage.getItem("2k27-build-lab")); } catch (e) { loaded = false; } }
    if (!loaded) {
      // A realistic starting point: a 6'5" two-way guard sketch, so the page opens showing what it does.
      state.pos = "SG"; state.h = 77; state.w = 195; state.ws = 81;
      state.want = [80, 88, 84, 25, 40, 82, 88, 75, 78, 86, 82, 45, 88, 80, 40, 40, 55, 84, 84, 60, 80];
    }
    syncBodyForm();
    recompute();
    trackHeaderHeight();
  }
  boot();

  // Pure logic, exposed so tools/audit.js can replay it against the raw engine captures.
  // Read-only surface for testing; the page itself never touches it.
  window.BuildLab = {
    state, capsFor, normalize, tokenCounts, badgeTier, plannedValues, ladderFor, fallbackF,
    encodeBuild, decodeBuild, recompute, setWant, step, setWantFromControl, stepMoves, typeLabel, animMeets,
    ATTRS, DISCS, TIER_NAMES,
  };
})();
