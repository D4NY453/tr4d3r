"""Detector de patrones chartistas (zigzag/ATR) + backtest. v3: sin look-ahead; añade triángulos y banderas,
y modelo de ejecución maker (limit en el retest de la ruptura). Sin órdenes reales."""
import json, sys
import numpy as np

FEE = 0.00045      # taker Hyperliquid por lado
MAKER_FEE = 0.00015  # maker Hyperliquid por lado (nivel base)
SLIP = 0.0002      # slippage supuesto por lado

def load(path):
    d = json.load(open(path))
    return {k: np.array([float(c[k]) for c in d]) for k in "ohlcv"} | {"t": np.array([c["t"] for c in d])}

def atr(h, l, c, n=14):
    tr = np.concatenate([[h[0]-l[0]], np.maximum(h[1:]-l[1:], np.maximum(abs(h[1:]-c[:-1]), abs(l[1:]-c[:-1])))])
    out = np.empty_like(tr); out[0] = tr[0]
    for i in range(1, len(tr)): out[i] = out[i-1] + (tr[i]-out[i-1])/n   # Wilder, causal
    return out

def ema(x, n):
    out = np.empty_like(x); out[0] = x[0]; k = 2/(n+1)
    for i in range(1, len(x)): out[i] = out[i-1] + k*(x[i]-out[i-1])
    return out

def zigzag(h, l, c, a, k):
    """Pivotes (idx_extremo, precio, 'H'/'L', idx_confirmacion). Confirmado cuando revierte k*ATR."""
    piv = []; trend = 1; ext = 0
    for i in range(1, len(c)):
        if trend > 0:
            if h[i] >= h[ext]: ext = i
            elif h[ext] - l[i] > k*a[i]:
                piv.append((ext, h[ext], "H", i)); trend = -1; ext = i
        else:
            if l[i] <= l[ext]: ext = i
            elif h[i] - l[ext] > k*a[i]:
                piv.append((ext, l[ext], "L", i)); trend = 1; ext = i
    return piv

def detect(d, k=3.0, tol_atr=1.0, vol_mult=1.2, lookahead=30, ema_filter=False, families=("classic",)):
    h, l, c, v = d["h"], d["l"], d["c"], d["v"]
    a = atr(h, l, c); piv = zigzag(h, l, c, a, k); e200 = ema(c, 200)
    vma = np.concatenate([[v[0]], np.convolve(v, np.ones(20)/20, "full")[:len(v)-1]])  # media de velas previas
    out, seen = [], set()
    def add(name, dirn, neck, stop, height, conf_i):
        # busca ruptura SOLO después de confirmado el último pivote
        for j in range(conf_i, min(conf_i+lookahead, len(c)-1)):
            broke = c[j] < neck if dirn < 0 else c[j] > neck
            if not broke: continue
            if (dirn < 0 and h[j] >= stop) or (dirn > 0 and l[j] <= stop): return  # invalidado
            if v[j] <= vol_mult*vma[j]: return                     # volumen obligatorio
            if ema_filter and ((dirn > 0) != (c[j] > e200[j])): return
            key = (name, j)
            if key in seen: return
            seen.add(key)
            out.append(dict(pattern=name, side="LONG" if dirn > 0 else "SHORT", break_idx=j,
                            entry=c[j], level=neck, stop=stop, target=neck+dirn*height))
            return
    if "classic" not in families: piv_classic = []
    else: piv_classic = piv
    for i in range(len(piv_classic)-4):
        p = piv[i:i+5]; t = "".join(x[2] for x in p); pr = [x[1] for x in p]
        tol = tol_atr*a[p[4][3]]; ci = p[4][3]; pad = 0.2*a[ci]
        if t == "HLHLH" and pr[2] > max(pr[0], pr[4]) and abs(pr[0]-pr[4]) <= 1.5*tol:
            neck = min(pr[1], pr[3]); add("HCH", -1, neck, pr[4]+pad, pr[2]-neck, ci)
        if t == "LHLHL" and pr[2] < min(pr[0], pr[4]) and abs(pr[0]-pr[4]) <= 1.5*tol:
            neck = max(pr[1], pr[3]); add("HCH inv", 1, neck, pr[4]-pad, neck-pr[2], ci)
        if t == "HLHLH" and max(pr[0], pr[2], pr[4])-min(pr[0], pr[2], pr[4]) <= tol:
            top = max(pr[0], pr[2], pr[4]); neck = min(pr[1], pr[3]); add("Triple techo", -1, neck, top+pad, top-neck, ci)
        if t == "LHLHL" and max(pr[0], pr[2], pr[4])-min(pr[0], pr[2], pr[4]) <= tol:
            bot = min(pr[0], pr[2], pr[4]); neck = max(pr[1], pr[3]); add("Triple suelo", 1, neck, bot-pad, neck-bot, ci)
    for i in range(len(piv_classic)-2):
        p = piv[i:i+3]; t = "".join(x[2] for x in p); pr = [x[1] for x in p]
        ci = p[2][3]; tol = tol_atr*a[ci]; pad = 0.2*a[ci]
        if t == "HLH" and abs(pr[0]-pr[2]) <= tol:
            top = max(pr[0], pr[2]); add("Doble techo", -1, pr[1], top+pad, top-pr[1], ci)
        if t == "LHL" and abs(pr[0]-pr[2]) <= tol:
            bot = min(pr[0], pr[2]); add("Doble suelo", 1, pr[1], bot-pad, pr[1]-bot, ci)
    if "triangle" in families:
        out += detect_triangles(d, piv, a, vma, e200, tol_atr, vol_mult, lookahead, ema_filter)
    if "flag" in families:
        out += detect_flags(d, a, vma, e200, vol_mult, ema_filter)
    return sorted(out, key=lambda s: s["break_idx"])

def _filters_ok(j, dirn, v, vma, vol_mult, ema_filter, c, e200):
    if v[j] <= vol_mult*vma[j]: return False
    if ema_filter and ((dirn > 0) != (c[j] > e200[j])): return False
    return True

def detect_triangles(d, piv, a, vma, e200, tol_atr, vol_mult, lookahead, ema_filter, slope_atr=0.3):
    """Triángulos con los 4 últimos pivotes confirmados (2 máximos + 2 mínimos).
    Ascendente: techo plano + mínimos crecientes -> LONG al romper el techo.
    Descendente: suelo plano + máximos decrecientes -> SHORT al romper el suelo.
    Simétrico: máximos decrecientes + mínimos crecientes -> ruptura en cualquier dirección.
    Las líneas se proyectan a la vela j usando solo pivotes ya confirmados (sin look-ahead)."""
    h, l, c, v = d["h"], d["l"], d["c"], d["v"]; out = []
    for i in range(len(piv)-3):
        p = piv[i:i+4]; ci = p[3][3]; at = a[ci]; tol = tol_atr*at; pad = 0.2*at
        H = [x for x in p if x[2] == "H"]; L = [x for x in p if x[2] == "L"]
        if len(H) != 2 or len(L) != 2: continue
        (ih1, h1, _, _), (ih2, h2, _, _) = H; (il1, l1, _, _), (il2, l2, _, _) = L
        height = max(h1, h2) - min(l1, l2)
        if height < 2*at: continue
        flat_top = abs(h1-h2) <= tol; flat_bot = abs(l1-l2) <= tol
        rising = l2 - l1 > slope_atr*at; falling = h1 - h2 > slope_atr*at
        if flat_top and rising: kind = "Triángulo ascendente"
        elif flat_bot and falling: kind = "Triángulo descendente"
        elif rising and falling: kind = "Triángulo simétrico"
        else: continue
        def upper(j):
            return max(h1, h2) if kind == "Triángulo ascendente" else h1 + (h2-h1)*(j-ih1)/(ih2-ih1)
        def lower(j):
            return min(l1, l2) if kind == "Triángulo descendente" else l1 + (l2-l1)*(j-il1)/(il2-il1)
        for j in range(ci, min(ci+lookahead, len(c)-1)):
            up, lo = upper(j), lower(j)
            if up <= lo: break                                   # vértice alcanzado: patrón agotado
            dirn = 1 if c[j] > up else (-1 if c[j] < lo else 0)
            if dirn == 0: continue
            if kind == "Triángulo ascendente" and dirn < 0: break  # rompió en contra: invalidado
            if kind == "Triángulo descendente" and dirn > 0: break
            if not _filters_ok(j, dirn, v, vma, vol_mult, ema_filter, c, e200): break
            lvl = up if dirn > 0 else lo
            stop = (max(lo, l2) - pad) if dirn > 0 else (min(up, h2) + pad)
            out.append(dict(pattern=kind, side="LONG" if dirn > 0 else "SHORT", break_idx=j,
                            entry=c[j], level=lvl, stop=stop, target=lvl + dirn*height))
            break
    return out

def detect_flags(d, a, vma, e200, vol_mult, ema_filter, pole_atr=4.0, pole_bars=12, flag_min=3,
                 flag_max=15, max_retrace=0.5):
    """Banderas alcistas/bajistas, escaneo causal vela a vela.
    Mástil: subida (bajada) >= pole_atr*ATR en <= pole_bars velas hasta el extremo e.
    Bandera: entre flag_min y flag_max velas después de e sin superar el extremo y retrocediendo <= 50% del mástil.
    Ruptura: primer cierre más allá del extremo e con volumen. Objetivo = longitud del mástil."""
    h, l, c, v = d["h"], d["l"], d["c"], d["v"]; out = []; used = set()
    for j in range(pole_bars+flag_max+2, len(c)):
        for dirn in (1, -1):
            lo_w = j-flag_max-1
            seg = h[lo_w:j] if dirn > 0 else -l[lo_w:j]
            e = lo_w + int(np.argmax(seg))                      # extremo dentro de la ventana (velas < j)
            m = j-e-1
            if m < flag_min or (dirn, e) in used: continue
            ext = h[e] if dirn > 0 else l[e]
            s0 = max(0, e-pole_bars)
            base = float(np.min(l[s0:e+1])) if dirn > 0 else float(np.max(h[s0:e+1]))
            pole = (ext - base)*dirn
            if pole < pole_atr*a[e]: continue
            cons_l, cons_h = l[e+1:j], h[e+1:j]
            if dirn > 0 and np.min(cons_l) < ext - max_retrace*pole: continue
            if dirn < 0 and np.max(cons_h) > ext + max_retrace*pole: continue
            broke = c[j] > ext if dirn > 0 else c[j] < ext
            if not broke: continue
            used.add((dirn, e))
            if not _filters_ok(j, dirn, v, vma, vol_mult, ema_filter, c, e200): continue
            pad = 0.2*a[j]
            stop = float(np.min(cons_l)) - pad if dirn > 0 else float(np.max(cons_h)) + pad
            out.append(dict(pattern="Bandera alcista" if dirn > 0 else "Bandera bajista",
                            side="LONG" if dirn > 0 else "SHORT", break_idx=j,
                            entry=c[j], level=ext, stop=stop, target=ext + dirn*pole))
    return out

def backtest(d, sigs, max_bars=48, one_at_a_time=True):
    """R neto (fees+slippage). Stop gana si stop y target en la misma vela (conservador)."""
    h, l, c = d["h"], d["l"], d["c"]; res = []; busy_until = -1
    cost = 2*(FEE+SLIP)
    for s in sigs:
        if one_at_a_time and s["break_idx"] <= busy_until: continue
        e, st, tg = s["entry"], s["stop"], s["target"]; sg = 1 if s["side"] == "LONG" else -1
        risk = abs(e-st)
        if risk <= 0 or sg*(tg-e) <= 0 or sg*(e-st) <= 0: continue
        end = min(s["break_idx"]+max_bars, len(c)-1); xp, xi = c[end], end
        for j in range(s["break_idx"]+1, end+1):
            if (sg > 0 and l[j] <= st) or (sg < 0 and h[j] >= st): xp, xi = st, j; break
            if (sg > 0 and h[j] >= tg) or (sg < 0 and l[j] <= tg): xp, xi = tg, j; break
        busy_until = xi
        res.append(dict(s, exit_idx=xi, R=(sg*(xp-e) - cost*e)/risk, stop_pct=risk/e))
    return res

def backtest_maker(d, sigs, max_bars=48, fill_bars=6, one_at_a_time=True):
    """Entrada LIMIT (maker) en el nivel roto (retest), colocada al cierre de la vela de ruptura.
    Si en `fill_bars` velas el precio no vuelve al nivel -> no se llena (operación perdida).
    Si toca el stop antes de llenarse -> cancelada. Salida en objetivo = limit maker; stop/tiempo = taker.
    Misma vela que llena y toca stop -> se cuenta como pérdida (conservador)."""
    h, l, c = d["h"], d["l"], d["c"]; res = []; busy_until = -1; missed = 0
    for s in sigs:
        if one_at_a_time and s["break_idx"] <= busy_until: continue
        lvl, st, tg = s["level"], s["stop"], s["target"]; sg = 1 if s["side"] == "LONG" else -1
        risk = abs(lvl-st)
        if risk <= 0 or sg*(tg-lvl) <= 0 or sg*(lvl-st) <= 0: continue
        fi = None
        for k in range(s["break_idx"]+1, min(s["break_idx"]+1+fill_bars, len(c))):
            if (sg > 0 and l[k] <= st) or (sg < 0 and h[k] >= st):
                if (sg > 0 and l[k] <= lvl) or (sg < 0 and h[k] >= lvl): fi = k   # llenó y paró en la misma vela
                break
            if (sg > 0 and h[k] >= tg) or (sg < 0 and l[k] <= tg): break          # se fue sin retest
            if (sg > 0 and l[k] <= lvl) or (sg < 0 and h[k] >= lvl): fi = k; break
        if fi is None:
            missed += 1; continue
        end = min(fi+max_bars, len(c)-1); xp, xi, kind = c[end], end, "time"
        for j in range(fi, end+1):
            if (sg > 0 and l[j] <= st) or (sg < 0 and h[j] >= st): xp, xi, kind = st, j, "stop"; break
            if j > fi and ((sg > 0 and h[j] >= tg) or (sg < 0 and l[j] <= tg)): xp, xi, kind = tg, j, "target"; break
        busy_until = xi
        exit_cost = MAKER_FEE if kind == "target" else FEE + SLIP
        R = (sg*(xp-lvl) - (MAKER_FEE + exit_cost)*lvl)/risk
        res.append(dict(s, entry=lvl, exit_idx=xi, R=R, stop_pct=risk/lvl))
    return res, missed

def stats(trs):
    if not trs: return dict(n=0, win=0, totalR=0, avgR=0, maxDD_R=0)
    r = np.array([t["R"] for t in trs]); eq = np.cumsum(r)
    dd = float(np.max(np.maximum.accumulate(np.concatenate([[0], eq]))[1:] - eq)) if len(eq) else 0
    return dict(n=len(r), win=round(float(np.mean(r > 0)), 3), totalR=round(float(r.sum()), 2),
                avgR=round(float(r.mean()), 3), maxDD_R=round(max(dd, 0), 2))

if __name__ == "__main__":
    d = load(sys.argv[1] if len(sys.argv) > 1 else "btc_1h.json")
    print(stats(backtest(d, detect(d))))
