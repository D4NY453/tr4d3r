"""Backtest v3: BTC/ETH x 5m/15m/1h x familias de patrones. Ajuste en 60% inicial (in-sample),
validación en 40% final (out-of-sample). Compara ejecución taker vs maker (limit en retest)."""
import itertools, json
from patterns import load, detect, backtest, backtest_maker, stats

FAMS = {"clásicos": ("classic",), "triángulos": ("triangle",), "banderas": ("flag",),
        "todos": ("classic", "triangle", "flag")}
GRID = list(itertools.product([2.0, 3.0, 4.0], [1.2, 1.5], [False, True], [24, 48]))
WARM = 300
rows = []
for coin in ["btc", "eth"]:
    for tf in ["5m", "15m", "1h"]:
        d = load(f"v2_{coin}_{tf}.json"); N = len(d["c"]); cut = int(N*0.6)
        IS = {k: v[:cut] for k, v in d.items()}; OOS = {k: v[cut-WARM:] for k, v in d.items()}
        for fname, fam in FAMS.items():
            best = None
            for k, vm, ef, mb in GRID:
                sg = detect(IS, k, 1.0, vm, 30, ef, fam)
                st = stats(backtest(IS, sg, mb))
                score = st["totalR"] - 0.5*st["maxDD_R"] if st["n"] >= 8 else -1e9 + st["n"]
                if best is None or score > best[0]: best = (score, (k, vm, ef, mb), st)
            _, (k, vm, ef, mb), st_is = best
            sg_is = detect(IS, k, 1.0, vm, 30, ef, fam)
            mk_is, _ = backtest_maker(IS, sg_is, mb)
            sg_o = [s for s in detect(OOS, k, 1.0, vm, 30, ef, fam) if s["break_idx"] >= WARM]
            tk_o = backtest(OOS, sg_o, mb)
            mk_o, missed = backtest_maker(OOS, sg_o, mb)
            r = dict(coin=coin.upper(), tf=tf, family=fname, params=dict(k=k, vol=vm, ema200=ef, max_bars=mb),
                     IS_taker=st_is, IS_maker=stats(mk_is), OOS_taker=stats(tk_o), OOS_maker=stats(mk_o),
                     OOS_signals=len(sg_o), OOS_maker_missed=missed)
            rows.append(r)
            print(coin, tf, fname, r["params"], "IS", st_is["n"], st_is["totalR"], "| OOS taker", r["OOS_taker"]["n"],
                  r["OOS_taker"]["totalR"], "| OOS maker", r["OOS_maker"]["n"], r["OOS_maker"]["totalR"], "missed", missed)
json.dump(rows, open("results_v3.json", "w"), indent=1, ensure_ascii=False, default=float)
with open("results_v3.md", "w") as f:
    f.write("| Activo | TF | Familia | IS taker n / R | OOS taker n / win / R | OOS maker n / win / R | maker sin llenar |\n|---|---|---|---|---|---|---|\n")
    for r in rows:
        a, b, c = r["IS_taker"], r["OOS_taker"], r["OOS_maker"]
        f.write(f"| {r['coin']} | {r['tf']} | {r['family']} | {a['n']} / {a['totalR']:+.1f} | {b['n']} / {b['win']*100:.0f}% / {b['totalR']:+.1f} | {c['n']} / {c['win']*100:.0f}% / {c['totalR']:+.1f} | {r['OOS_maker_missed']} |\n")
