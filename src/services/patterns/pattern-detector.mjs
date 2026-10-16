// Detector de patrones chartistas SIN look-ahead (port 1:1 de 4g3nt-patterns/patterns.py v3).
// Clásicos: HCH, HCH invertido, doble/triple techo y suelo. Fase 2: triángulos y banderas.
// Confirmación obligatoria: cierre que rompe el nivel + volumen > volMult x media de 20 velas previas.
// Uso en el bot: lib/patterns-bridge.mjs (params.live = true) (desactivado por defecto con usePatternSignals=false).

export const DEFAULT_PATTERN_PARAMS = Object.freeze({
  '5m': { k: 3.0, tolAtr: 1.0, volMult: 1.5, lookahead: 30, emaFilter: true, families: ['classic'] },
  '15m': { k: 4.0, tolAtr: 1.0, volMult: 1.2, lookahead: 30, emaFilter: false, families: ['classic'] },
  '1h': { k: 3.0, tolAtr: 1.0, volMult: 1.2, lookahead: 30, emaFilter: true, families: ['classic'] },
});

export function atr(h, l, c, n = 14) {
  const out = new Array(c.length);
  out[0] = h[0] - l[0];
  for (let i = 1; i < c.length; i++) {
    const tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    out[i] = out[i - 1] + (tr - out[i - 1]) / n; // Wilder, causal
  }
  return out;
}

export function ema(x, n) {
  const out = new Array(x.length);
  out[0] = x[0];
  const k = 2 / (n + 1);
  for (let i = 1; i < x.length; i++) out[i] = out[i - 1] + k * (x[i] - out[i - 1]);
  return out;
}

/** Media de volumen de las 20 velas PREVIAS (igual que np.convolve(...)[:n-1] desplazado). */
function prevVolMean(v, n = 20) {
  const out = new Array(v.length);
  out[0] = v[0];
  let sum = 0;
  for (let i = 1; i < v.length; i++) {
    sum += v[i - 1];
    if (i - 1 - n >= 0) sum -= v[i - 1 - n];
    out[i] = sum / n;
  }
  return out;
}

/** Pivotes [idxExtremo, precio, 'H'|'L', idxConfirmación]; confirmado al revertir k x ATR. */
export function zigzag(h, l, c, a, k) {
  const piv = [];
  let trend = 1;
  let ext = 0;
  for (let i = 1; i < c.length; i++) {
    if (trend > 0) {
      if (h[i] >= h[ext]) ext = i;
      else if (h[ext] - l[i] > k * a[i]) { piv.push([ext, h[ext], 'H', i]); trend = -1; ext = i; }
    } else {
      if (l[i] <= l[ext]) ext = i;
      else if (h[i] - l[ext] > k * a[i]) { piv.push([ext, l[ext], 'L', i]); trend = 1; ext = i; }
    }
  }
  return piv;
}

const sideOf = (d) => (d > 0 ? 'LONG' : 'SHORT');

/**
 * d = { o?, h, l, c, v } (arrays de números). Devuelve señales ordenadas por breakIdx:
 * { pattern, side, breakIdx, entry, level, stop, target }.
 */
export function detectPatterns(d, params = {}) {
  const { k = 3.0, tolAtr = 1.0, volMult = 1.2, lookahead = 30, emaFilter = false, families = ['classic'], live = false } = params;
  const { h, l, c, v } = d;
  const n = c.length;
  // En backtest la última vela no se evalúa (hace falta la siguiente para operar); en vivo sí.
  const jEnd = live ? n : n - 1;
  const a = atr(h, l, c);
  const piv = zigzag(h, l, c, a, k);
  const e200 = ema(c, 200);
  const vma = prevVolMean(v);
  const out = [];
  const seen = new Set();
  const filtersOk = (j, dirn) => {
    if (v[j] <= volMult * vma[j]) return false;
    if (emaFilter && (dirn > 0) !== (c[j] > e200[j])) return false;
    return true;
  };

  const add = (name, dirn, neck, stop, height, ci) => {
    for (let j = ci; j < Math.min(ci + lookahead, jEnd); j++) {
      const broke = dirn < 0 ? c[j] < neck : c[j] > neck;
      if (!broke) continue;
      if ((dirn < 0 && h[j] >= stop) || (dirn > 0 && l[j] <= stop)) return;
      if (v[j] <= volMult * vma[j]) return;
      if (emaFilter && (dirn > 0) !== (c[j] > e200[j])) return;
      const key = `${name}|${j}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ pattern: name, side: sideOf(dirn), breakIdx: j, entry: c[j], level: neck, stop, target: neck + dirn * height });
      return;
    }
  };

  if (families.includes('classic')) {
    for (let i = 0; i < piv.length - 4; i++) {
      const p = piv.slice(i, i + 5);
      const t = p.map((x) => x[2]).join('');
      const pr = p.map((x) => x[1]);
      const ci = p[4][3];
      const tol = tolAtr * a[ci];
      const pad = 0.2 * a[ci];
      if (t === 'HLHLH' && pr[2] > Math.max(pr[0], pr[4]) && Math.abs(pr[0] - pr[4]) <= 1.5 * tol) {
        const neck = Math.min(pr[1], pr[3]); add('HCH', -1, neck, pr[4] + pad, pr[2] - neck, ci);
      }
      if (t === 'LHLHL' && pr[2] < Math.min(pr[0], pr[4]) && Math.abs(pr[0] - pr[4]) <= 1.5 * tol) {
        const neck = Math.max(pr[1], pr[3]); add('HCH inv', 1, neck, pr[4] - pad, neck - pr[2], ci);
      }
      const rng = Math.max(pr[0], pr[2], pr[4]) - Math.min(pr[0], pr[2], pr[4]);
      if (t === 'HLHLH' && rng <= tol) {
        const top = Math.max(pr[0], pr[2], pr[4]); const neck = Math.min(pr[1], pr[3]);
        add('Triple techo', -1, neck, top + pad, top - neck, ci);
      }
      if (t === 'LHLHL' && rng <= tol) {
        const bot = Math.min(pr[0], pr[2], pr[4]); const neck = Math.max(pr[1], pr[3]);
        add('Triple suelo', 1, neck, bot - pad, neck - bot, ci);
      }
    }
    for (let i = 0; i < piv.length - 2; i++) {
      const p = piv.slice(i, i + 3);
      const t = p.map((x) => x[2]).join('');
      const pr = p.map((x) => x[1]);
      const ci = p[2][3];
      const tol = tolAtr * a[ci];
      const pad = 0.2 * a[ci];
      if (t === 'HLH' && Math.abs(pr[0] - pr[2]) <= tol) {
        const top = Math.max(pr[0], pr[2]); add('Doble techo', -1, pr[1], top + pad, top - pr[1], ci);
      }
      if (t === 'LHL' && Math.abs(pr[0] - pr[2]) <= tol) {
        const bot = Math.min(pr[0], pr[2]); add('Doble suelo', 1, pr[1], bot - pad, pr[1] - bot, ci);
      }
    }
  }

  if (families.includes('triangle')) {
    const slopeAtr = 0.3;
    for (let i = 0; i < piv.length - 3; i++) {
      const p = piv.slice(i, i + 4);
      const ci = p[3][3];
      const at = a[ci];
      const tol = tolAtr * at;
      const pad = 0.2 * at;
      const H = p.filter((x) => x[2] === 'H');
      const L = p.filter((x) => x[2] === 'L');
      if (H.length !== 2 || L.length !== 2) continue;
      const [[ih1, h1], [ih2, h2]] = H;
      const [[il1, l1], [il2, l2]] = L;
      const height = Math.max(h1, h2) - Math.min(l1, l2);
      if (height < 2 * at) continue;
      const flatTop = Math.abs(h1 - h2) <= tol;
      const flatBot = Math.abs(l1 - l2) <= tol;
      const rising = l2 - l1 > slopeAtr * at;
      const falling = h1 - h2 > slopeAtr * at;
      let kind;
      if (flatTop && rising) kind = 'Triángulo ascendente';
      else if (flatBot && falling) kind = 'Triángulo descendente';
      else if (rising && falling) kind = 'Triángulo simétrico';
      else continue;
      const upper = (j) => (kind === 'Triángulo ascendente' ? Math.max(h1, h2) : h1 + ((h2 - h1) * (j - ih1)) / (ih2 - ih1));
      const lower = (j) => (kind === 'Triángulo descendente' ? Math.min(l1, l2) : l1 + ((l2 - l1) * (j - il1)) / (il2 - il1));
      for (let j = ci; j < Math.min(ci + lookahead, jEnd); j++) {
        const up = upper(j);
        const lo = lower(j);
        if (up <= lo) break;
        const dirn = c[j] > up ? 1 : c[j] < lo ? -1 : 0;
        if (dirn === 0) continue;
        if (kind === 'Triángulo ascendente' && dirn < 0) break;
        if (kind === 'Triángulo descendente' && dirn > 0) break;
        if (!filtersOk(j, dirn)) break;
        const lvl = dirn > 0 ? up : lo;
        const stop = dirn > 0 ? Math.max(lo, l2) - pad : Math.min(up, h2) + pad;
        out.push({ pattern: kind, side: sideOf(dirn), breakIdx: j, entry: c[j], level: lvl, stop, target: lvl + dirn * height });
        break;
      }
    }
  }

  if (families.includes('flag')) {
    const poleAtr = 4.0, poleBars = 12, flagMin = 3, flagMax = 15, maxRetrace = 0.5;
    const used = new Set();
    for (let j = poleBars + flagMax + 2; j < n; j++) {
      for (const dirn of [1, -1]) {
        const loW = j - flagMax - 1;
        let e = loW;
        for (let x = loW + 1; x < j; x++) {
          if (dirn > 0 ? h[x] > h[e] : l[x] < l[e]) e = x; // primer máximo (como np.argmax)
        }
        const m = j - e - 1;
        if (m < flagMin || used.has(`${dirn}|${e}`)) continue;
        const ext = dirn > 0 ? h[e] : l[e];
        const s0 = Math.max(0, e - poleBars);
        let base = dirn > 0 ? Infinity : -Infinity;
        for (let x = s0; x <= e; x++) base = dirn > 0 ? Math.min(base, l[x]) : Math.max(base, h[x]);
        const pole = (ext - base) * dirn;
        if (pole < poleAtr * a[e]) continue;
        let consLo = Infinity, consHi = -Infinity;
        for (let x = e + 1; x < j; x++) { consLo = Math.min(consLo, l[x]); consHi = Math.max(consHi, h[x]); }
        if (dirn > 0 && consLo < ext - maxRetrace * pole) continue;
        if (dirn < 0 && consHi > ext + maxRetrace * pole) continue;
        const broke = dirn > 0 ? c[j] > ext : c[j] < ext;
        if (!broke) continue;
        used.add(`${dirn}|${e}`);
        if (!filtersOk(j, dirn)) continue;
        const pad = 0.2 * a[j];
        const stop = dirn > 0 ? consLo - pad : consHi + pad;
        out.push({ pattern: dirn > 0 ? 'Bandera alcista' : 'Bandera bajista', side: sideOf(dirn), breakIdx: j,
          entry: c[j], level: ext, stop, target: ext + dirn * pole });
      }
    }
  }

  return out.sort((x, y) => x.breakIdx - y.breakIdx);
}
