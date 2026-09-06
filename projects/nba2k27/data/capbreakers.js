// NBA 2K27 Cap Breaker gains.
//
// Not fitted. The gain comes out of the same weight table the overall rating uses, which the game
// ships and which data/model.js carries:
//
//   f    = (maxWeight - weight[attr]) / maxWeight   over the 21 attributes at this height and
//                                                   player type, raw weights, no rating scale
//   E(L) = 15 - floor(14 * (L - 25) / 74)           what one breaker is worth at rating L
//   gain = max(1, roundHalfEven(f * E(L)))          five times in sequence, clipped at the body
//                                                   cap and at 99
//
// So an attribute your archetype values most moves a single point and one it does not care about
// moves the most, which is what 2K describes in words. Checked against 1680 captured ladders: 99.96%
// exact, against 99.97% for the 4,775-number fitted table this replaced. Banker's rounding is not
// optional; half-up scores 99.47%.
window.CAPBREAKERS = (function () {
  const D = {"attrs":["Close Shot","Driving Layup","Driving Dunk","Standing Dunk","Post Control","Mid-Range","Three-Point","Free Throw","Pass Accuracy","Ball Handle","Speed With Ball","Interior D","Perimeter D","Steal","Block","Off. Rebound","Def. Rebound","Speed","Agility","Strength","Vertical"],"maxPerAttr":5,"availableNow":20,"totalYear":28,"captures":1680};
  const HARD_CAP = 99;
  const E = (L) => 15 - Math.floor((14 * (L - 25)) / 74);
  function roundHalfEven(x) {
    const fl = Math.floor(x), fr = x - fl;
    if (Math.abs(fr - 0.5) < 1e-9) return fl % 2 === 0 ? fl : fl + 1;
    return Math.floor(x + 0.5);
  }
  return {
    attrs: D.attrs,
    maxPerAttr: D.maxPerAttr, availableNow: D.availableNow, totalYear: D.totalYear, captures: D.captures,
    // `fallback` is unused now that f is derived. The parameter stays so the existing call site keeps working.
    ladderFor(type, h, i, rating, cap, fallback) {
      const W = (window.MODEL && window.MODEL.weightRow) ? window.MODEL.weightRow(type, h) : null;
      const limit = Math.min(HARD_CAP, cap);
      if (!W) return { gains: [0, 0, 0, 0, 0], src: "no weights", f: null };
      let maxW = 0;
      for (let k = 0; k < 21; k++) if (W[k] > maxW) maxW = W[k];
      if (!maxW) return { gains: [0, 0, 0, 0, 0], src: "no weights", f: null };
      const f = (maxW - W[i]) / maxW;
      const out = [];
      let cur = rating;
      for (let k = 0; k < 5; k++) {
        let g = cur >= HARD_CAP ? 0 : Math.max(1, roundHalfEven(f * E(cur)));
        g = Math.max(0, Math.min(g, limit - cur));
        out.push(g); cur += g;
      }
      return { gains: out, src: "engine weights", f: f };
    },
  };
})();
