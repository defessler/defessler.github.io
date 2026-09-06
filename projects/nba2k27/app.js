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
  function normalize(want, caps, h) {
    const rules = MODEL.linkedRules(h);
    const v = want.map((x, i) => clamp(x, 25, caps[i]));
    const forced = new Set(), limited = new Set();
    let changed = true, guard = 0;
    while (changed && guard++ < 60) {
      changed = false;
      for (const [s, t, d] of rules) {
        const maxSource = caps[t] + d;
        if (v[s] > maxSource) { v[s] = Math.max(25, maxSource); limited.add(s); changed = true; }
        const need = v[s] - d;
        if (v[t] < need) { v[t] = Math.min(caps[t], need); if (v[t] > want[t]) forced.add(t); changed = true; }
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
          <div class="name">${ATTRS[i]}<small data-forced="${i}"></small></div>
          <div class="track"><input type="range" min="25" max="99" step="1" data-range="${i}" aria-label="${ATTRS[i]}"><div class="ticks" data-ticks="${i}"></div><div class="capline" data-capline="${i}"></div></div>
          <input type="number" min="25" max="99" step="1" data-num="${i}" aria-label="${ATTRS[i]} value">
          <div class="cap num">cap <b data-cap="${i}">--</b></div>
          <div class="next num" data-next="${i}"></div>`;
        rows.appendChild(row);
        attrEls[i] = {
          row, range: row.querySelector("input[type=range]"), num: row.querySelector("input[type=number]"),
          cap: row.querySelector("[data-cap]"), forced: row.querySelector("[data-forced]"), ticks: row.querySelector("[data-ticks]"),
          capline: row.querySelector("[data-capline]"), next: row.querySelector("[data-next]")
        };
        attrEls[i].range.addEventListener("input", e => setWant(i, +e.target.value));
        attrEls[i].num.addEventListener("change", e => setWant(i, +e.target.value));
        attrEls[i].num.addEventListener("keydown", e => {
          if (e.key === "ArrowUp") { e.preventDefault(); setWant(i, state.want[i] + 1); }
          if (e.key === "ArrowDown") { e.preventDefault(); setWant(i, state.want[i] - 1); }
        });
      });
      col.appendChild(panel);
    });
  }

  function setWant(i, v) {
    const caps = state.caps || [];
    state.want[i] = clamp(Math.round(v) || 25, 25, caps[i] || 99);
    recompute();
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
    for (let i = 0; i < 21; i++) {
      const el = attrEls[i], cap = caps[i], v = state.values[i];
      el.range.max = 99; el.range.value = v; el.num.value = v; el.num.max = cap;
      el.cap.textContent = cap;
      const p = ((v - 25) / 74 * 100).toFixed(2) + "%", cp = ((cap - 25) / 74 * 100).toFixed(2) + "%";
      el.range.style.setProperty("--p", p); el.range.style.setProperty("--cp", cp);
      el.capline.style.left = `calc(7px + (100% - 14px) * ${(cap - 25) / 74})`;
      el.row.classList.toggle("forced", state.forced.has(i));
      el.forced.textContent = state.forced.has(i) ? `raised to ${v} by a linked attribute` : (state.limited.has(i) ? `held at ${v} by a linked cap` : "");
      // ticks: token thresholds for this attribute
      const lad = ladders && ladders[i];
      el.ticks.innerHTML = lad && lad.d !== null ? lad.t.filter(t => t <= cap).map(t => `<i class="tok" style="left:${((t - 25) / 74 * 100).toFixed(2)}%" title="token at ${t}"></i>`).join("") : "";
      // next unlock text
      el.next.innerHTML = nextUnlockText(i, v, cap, lad);
    }
    DISCS.forEach((d, di) => {
      const totalPossible = ladders ? d.idx.reduce((s, i) => s + ((ladders[i] && ladders[i].d !== null) ? ladders[i].t.length : 0), 0) : 0;
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
    for (const b of BADGES.list) {
      if (state.h < b.minH || state.h > b.maxH) continue;
      for (const r of b.reqs) {
        if (r.attr !== i) continue;
        for (let t = 0; t < 4; t++) {
          const th = r.tiers[t];
          if (th === null || th <= v || th > cap) continue;
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

  // The overall is a fitted estimate, not a reading. Held out against engine captures its median
  // error is about a tenth of a point, but a minority of builds land a few points off, so the
  // display says "est." and rounds to one decimal rather than implying a precision it doesn't have.
  // Calling a build "over budget" is an accusation, so it needs to clear the model's own error
  // rather than a bare 99.00. Inside this band the honest answer is "right at the ceiling" - six of
  // 2K's own Signature Blueprints land there, and they are legal builds by definition.
  const OVER_TOLERANCE = 1.5;
  function renderOverall(ovr) {
    const disp = $("ovrDisplay"), det = $("ovrDetail"), bar = $("ovrBar"), hint = $("ovrHint");
    const over = ovr.raw > 99 + OVER_TOLERANCE;
    const atCeiling = !over && ovr.raw >= 99;
    disp.textContent = ovr.display;
    det.textContent = ovr.raw >= 99 ? "" : "est. " + ovr.raw.toFixed(1);
    const pct = clamp((ovr.raw - 25) / 74 * 100, 0, 100);
    bar.querySelector("i").style.width = pct + "%";
    bar.classList.toggle("over", over);
    bar.classList.toggle("done", !over && ovr.display >= 99);
    if (over) {
      hint.innerHTML = `<span class="pill bad">Over budget</span> this build lands near <b class="num">${ovr.raw.toFixed(1)}</b>, past the 99 ceiling. Lower something by roughly <b>${(ovr.raw - 99).toFixed(1)}</b> overall.`;
    } else if (atCeiling) {
      hint.innerHTML = `<span class="pill good">At the ceiling</span> this build fills the budget. It may sit a point either side of 99, so check the last upgrade in game.`;
    } else {
      const left = 99 - ovr.raw;
      hint.innerHTML = `<span class="pill ${left < 0.6 ? "good" : "warn"}">${left < 0.6 ? "Budget filled" : "Budget left"}</span> about <b class="num">${left.toFixed(1)}</b> overall still to spend. Estimated, so confirm the last point or two in game.`;
    }
  }

  // ---------- side tabs ----------
  function renderTab() {
    const t = state.tab;
    document.querySelectorAll("#tabs button").forEach(b => {
      const on = b.dataset.tab === t;
      b.setAttribute("aria-selected", String(on));
      b.setAttribute("tabindex", on ? "0" : "-1");   // roving tabindex: one stop for the whole strip
    });
    document.querySelectorAll(".tabpanel").forEach(p => p.hidden = p.id !== `tab-${t}`);
    if (t === "badges") renderBadges();
    if (t === "takeovers") renderTakeovers();
    if (t === "anims") renderAnims();
    if (t === "capbreakers") renderCapBreakers();
    if (t === "blueprints") renderBlueprints();
    if (t === "summary") renderSummary();
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
    el.innerHTML = html;
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
      the table NBA2KLab ships with its takeover page.</p>`;
    el.innerHTML = html;
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
    const ok = a.or ? checks.some(c => c.ok) : checks.every(c => c.ok);
    return { ok, why: checks.map(c => `${SHORT[c.i]} ${c.m}`).join(a.or ? " / " : " + ") };
  }

  function renderAnims() {
    const el = $("tab-anims");
    const sections = [["Dunks & layups", ANIMATIONS.finishing], ["Dribble moves & styles", ANIMATIONS.dribbling],
      ["Jump shots & post shots", ANIMATIONS.shooting], ["Jumper bases", ANIMATIONS.jumpers], ["Motion styles", ANIMATIONS.motion]];
    let html = `<div class="ctl"><input type="search" id="animSearch" aria-label="Search animations or players" placeholder="Search animations or players" value="${state.animSearch.replace(/"/g, "&quot;")}"><label><input type="checkbox" id="animOnly" ${state.animOnly ? "checked" : ""}> Only what this build unlocks</label></div>`;
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
    // Re-rendering replaces the search box itself, so focus and caret are restored afterwards.
    // Without this the field drops focus after every keystroke and becomes unusable.
    const active = document.activeElement;
    const keepFocus = active && active.id === "animSearch";
    const caret = keepFocus ? active.selectionStart : null;
    el.innerHTML = html;
    const search = $("animSearch");
    if (keepFocus && search) {
      search.focus();
      try { search.setSelectionRange(caret, caret); } catch (e) { /* not all inputs support it */ }
    }
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
  function renderCapBreakers() {
    const el = $("tab-capbreakers");
    const v = state.values, caps = state.caps;
    const used = state.cbPlan.reduce((a, b, i) => a + productivePlan(i), 0);
    const after = plannedValues();
    const haveRule = !!window.CAPBREAKERS;
    const gained = after.reduce((s, x, i) => s + (x - v[i]), 0);
    let html = `<div class="cbsum">
      <div><div class="v num ${used > CB_TOTAL_NOW ? "over" : ""}">${used}</div><div class="l">Breakers planned</div></div>
      <div><div class="v num">+${gained}</div><div class="l">Attribute points gained</div></div>
      <div><div class="v num">${CB_TOTAL_NOW}<small style="font-size:14px;color:var(--muted)"> / ${CB_TOTAL_YEAR}</small></div><div class="l">Earnable now / this year</div></div>
    </div>
    <p class="note" style="margin:0 0 6px">Cap Breakers unlock once a build reaches 99 overall. Each chip is one breaker on that attribute, up to five, showing the points it adds from where the attribute sits now. Click a chip to plan that many. Gains stop at the body cap and never earn badge tokens.</p>`;
    if (!haveRule) {
      html += `<p class="note">The gain rule is still being fitted from engine captures. Ladders will appear here once it lands.</p>`;
      el.innerHTML = html; return;
    }
    const srcs = new Set();
    DISCS.forEach((d) => {
      html += `<div class="bcat" style="--c:${d.color};--ci:${d.ink}"><h3>${d.key}</h3>`;
      d.idx.forEach(i => {
        const res = ladderFor(i) || { gains: [0, 0, 0, 0, 0], src: "no data" };
        const lad = res.gains; srcs.add(res.src);
        const n = state.cbPlan[i];
        let cur = v[i]; const chips = [];
        for (let k = 0; k < 5; k++) {
          const g = lad[k]; const cls = ["chip"];
          if (g <= 0) cls.push("locked"); else if (k < n) cls.push("on"); else if (k === n) cls.push("next");
          const label = g > 0 ? `Cap breaker ${k + 1} on ${SHORT[i]}: +${g}, ${cur} to ${cur + g}` : `${SHORT[i]} has nothing left to gain`;
          chips.push(`<span class="${cls.join(" ")}" data-cb="${i}" data-k="${k}"${g > 0 ? ' role="button" tabindex="0"' : ' aria-disabled="true"'} aria-pressed="${k < n}" title="${label}" aria-label="${label}">${g > 0 ? "+" + g : "–"}</span>`);
          cur += Math.max(0, g);
        }
        const maxed = v[i] >= caps[i];
        html += `<div class="cbrow ${maxed ? "maxed" : ""}"><div class="cn">${SHORT[i]}<small>now ${v[i]} · cap ${caps[i]}</small></div><div class="chips">${chips.join("")}</div><div class="after"><b>${after[i]}</b><small>${n ? `after ${n} breaker${n > 1 ? "s" : ""}` : (maxed ? "at cap" : "no breakers")}</small></div></div>`;
      });
      html += `</div>`;
    });
    // what the plan changes: badges and takeovers
    if (used) {
      const before = BADGES.list.map(b => badgeTier(b, v, state.h).tier);
      const post = BADGES.list.map(b => badgeTier(b, after, state.h).tier);
      const changes = BADGES.list.map((b, k) => ({ b, from: before[k], to: post[k] })).filter(x => x.to > x.from);
      const tk = TAKEOVERS.list.filter(t => t.logic !== "ALWAYS").map(t => {
        const met = (r) => t.logic === "OR" ? t.reqs.some(([a, m]) => r[a] >= m) : t.reqs.every(([a, m]) => r[a] >= m);
        return { t, from: met(v), to: met(after) };
      }).filter(x => x.to && !x.from);
      html += `<h3 style="margin:12px 0 4px;font-size:16px">What this plan unlocks</h3>`;
      if (!changes.length && !tk.length) html += `<p class="note" style="margin:0">No new badge tiers or takeovers. The points still raise the attributes themselves.</p>`;
      html += `<div class="gainlist">${changes.map(x => `<div class="g"><span>${x.b.name}</span><span>${TIER_NAMES[x.from] || "Locked"} → <b>${TIER_NAMES[x.to]}</b></span></div>`).join("")}${tk.map(x => `<div class="g"><span>${x.t.name} takeover</span><span>Locked → <b>Unlocked</b></span></div>`).join("")}</div>`;
    }
    const measured = [...srcs].every(s => s === "measured");
    html += `<p class="note">${measured
      ? "Every ladder here is measured: this archetype and height were sampled directly from the engine."
      : "Some ladders are read across from the nearest sampled heights for this archetype, so treat those as close estimates."}
      The rule behind them, recovered from ${(CAPBREAKERS.captures || "hundreds of")} builds captured from the engine, is that one breaker adds
      <b>max(1, round(f &times; E))</b> points, where E falls from 15 at rating 25 to 2 near 99 and f is how little this archetype
      values that attribute. Confirm a final build in the NBA 2K HQ app before spending one.</p>`;
    el.innerHTML = html;
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
    el.innerHTML = html;
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
      <dt>Archetype</dt><dd>${MODEL.typeName(state.ovr.type)}</dd>
      <dt>Raw potential</dt><dd class="num">${state.ovr.raw.toFixed(3)} (the game rounds a finished build up to 99 once nothing can be raised)</dd>
      <dt>Tokens</dt><dd>${tok.known ? DISCS.map((d, i) => `${d.key} ${tok.perDisc[i]}`).join(" · ") : "no ladder data for this height yet"}</dd>
    </dl>
    <h3 style="margin:12px 0 4px;font-size:16px">Attribute sheet</h3>
    <div class="kv" style="grid-template-columns:auto auto auto;">${DISCS.map(d => d.idx.map(i => `<dt>${ATTRS[i]}</dt><dd class="num"><b>${v[i]}</b></dd><dd class="num" style="color:var(--muted)">cap ${caps[i]}</dd>`).join("")).join("")}</div>
    <h3 style="margin:12px 0 4px;font-size:16px">Share</h3>
    <p class="note" style="margin:0 0 6px">The page link updates as you edit. This code holds the same build:</p>
    <textarea readonly id="buildCode" aria-label="Build share code">${code}</textarea>
    <div class="ctl" style="margin-top:6px"><button class="btn" id="copyCode">Copy code</button><input type="text" id="pasteCode" aria-label="Paste a build code" placeholder="Paste a build code" style="flex:1;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:6px 8px"><button class="btn" id="loadCode">Load</button></div>
    <h3 style="margin:14px 0 4px;font-size:16px">How the numbers are built</h3>
    <p class="note" style="margin:0">Caps are the game engine's values for this exact height, weight, and wingspan (NBA2KLab dataset, cross-checked against two other builders). Linked minimums and token ladders come from Locker Codes' engine captures. The overall potential is a fitted model of the same engine data. ${MODEL.notes}</p>`;
    el.innerHTML = html;
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
  }
  function bindBodyForm() {
    const posSel = $("pos");
    POSITIONS.forEach(p => { const o = document.createElement("option"); o.value = p; o.textContent = `${p} · ${POS_NAME[p]}`; posSel.appendChild(o); });
    posSel.addEventListener("change", () => { state.pos = posSel.value; syncBodyForm(); recompute(); });
    $("height").addEventListener("change", () => { state.h = +$("height").value; syncBodyForm(); recompute(); });
    $("weight").addEventListener("change", () => { state.w = +$("weight").value; syncBodyForm(); recompute(); });
    $("wing").addEventListener("change", () => { state.ws = +$("wing").value; recompute(); });
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
    return `${state.pos}-${state.h}-${state.w}-${state.ws}-${attrs}`;
  }
  function decodeBuild(code) {
    const m = /^(PG|SG|SF|PF|C)-(\d+)-(\d+)-(\d+)-(.{21})$/.exec(code || "");
    if (!m) return false;
    const pos = m[1], h = +m[2], w = +m[3], ws = +m[4];
    if (!BODIES[pos] || !BODIES[pos][String(h)]) return false;
    const want = Array.from(m[5], ch => { const k = A36.indexOf(ch); return k < 0 ? 25 : 25 + k; });
    state.pos = pos; state.h = h; state.w = w; state.ws = ws; state.want = want;
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
    encodeBuild, decodeBuild, recompute, setWant,
    ATTRS, DISCS, TIER_NAMES,
  };
})();
