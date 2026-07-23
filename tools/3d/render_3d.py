#!/usr/bin/env python3
"""
SPX6900 — 3D "showcase" renderer (SIDE PROJECT, hand-posted tweets only).

WHY THIS IS SEPARATE: the Node card pipeline (Resvg, SVG->PNG) can't do 3D/Python.
These are eye-catching STATIC/ANIMATED 3D renders for dedicated tweets — NOT rotating
bot cards. Reads the same on-chain data the site uses (public/onchain.json + public/urpd.json).

DEPS (one-off):  pip install matplotlib numpy pillow imageio imageio-ffmpeg
RUN:             python3 tools/3d/render_3d.py            # renders all PNGs
                 python3 tools/3d/render_3d.py --spin cba # + a 360° MP4/GIF of one chart
OUTPUT:          tools/3d/out/*.png|mp4|gif  (gitignored)

CHARTS (all from real data, 3 genuine dims = two axes + magnitude):
  cba   Cost basis x holding age  (price x age x supply)      [urpd.json bucket.age]
  hodl  HODL Waves in 3D          (time x age x supply)        [onchain.json .age]   ← the standout
  ven   Exchange supply by venue  (time x venue x supply)      [onchain.json .cexVenues]
Backlog ideas (not built): URPD terrain over time (needs weekly URPD history from the
FIFO engine), seasonality 3D calendar (year x month x return, data ready in src/data.js).
"""
import json, io, sys, os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.colors import to_rgba
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
BG = (10, 14, 28); PANE = (0.04, 0.06, 0.12, 1.0)
AGE_C = ["#fb7185", "#fb923c", "#fbbf24", "#a78bfa", "#22d3ee"]; AGE_L = ["0-1m", "1-3m", "3-6m", "6-12m", "1y+"]
VEN_PAL = ["#f7931a", "#f6465d", "#a78bfa", "#22d3ee", "#4ade80", "#fbbf24", "#60a5fa", "#fb7185"]

def load(p): return json.load(open(os.path.join(ROOT, p)))
def font(sz, b=False):
    try: return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if b else ""), sz)
    except Exception: return ImageFont.load_default()
def style(ax):
    ax.set_facecolor("#0a0e1c")
    for a in (ax.xaxis, ax.yaxis, ax.zaxis):
        a.set_pane_color(PANE); a.pane.set_edgecolor((1, 1, 1, 0.10)); a.line.set_color((1, 1, 1, 0.15))
    ax.tick_params(colors="#8b97ad", labelsize=8); ax.grid(False)

def compose(buf, title, sub, foot, name):
    """Tight-crop the chart and paste it dead-CENTER on a 1200x675 branded canvas."""
    ch = Image.open(buf).convert("RGB"); W, H = 1200, 675
    cv = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(cv)
    bt, bb = 118, H - 46; mw, mh = W - 70, bb - bt
    s = min(mw / ch.width, mh / ch.height); nw, nh = int(ch.width * s), int(ch.height * s)
    ch = ch.resize((nw, nh)); cv.paste(ch, ((W - nw) // 2, bt + (mh - nh) // 2))
    d.text((52, 34), title, fill=(241, 245, 249), font=font(33, True))
    d.text((52, 80), sub, fill=(148, 163, 184), font=font(18))
    d.text((52, H - 32), foot, fill=(100, 116, 139), font=font(15))
    p = os.path.join(OUT, name); cv.save(p); print("wrote", p); return cv

# ---- ridge-collection helper (waterfall of filled areas over an axis) ----
def waterfall(ax, series, colors, zs, tN):
    verts = [[(0, 0)] + list(zip(np.arange(tN), z)) + [(tN - 1, 0)] for z in series]
    pc = PolyCollection(verts, facecolors=[to_rgba(c, 0.86) for c in colors],
                        edgecolors=[to_rgba("#0a0e1c", 0.7)] * len(series), linewidths=0.6)
    ax.add_collection3d(pc, zs=zs, zdir="y")

def render_cba(azim=-120, elev=20, name="cba.png"):
    u = load("public/urpd.json"); bk = [b for b in u["buckets"] if b.get("age")]
    px = np.array([(b["lo"] * b["hi"]) ** 0.5 for b in bk]); Z = np.array([b["age"] for b in bk]); nP = len(bk)
    fig = plt.figure(figsize=(9, 6.4), dpi=150); fig.patch.set_facecolor("#0a0e1c")
    ax = fig.add_subplot(111, projection="3d"); style(ax)
    xpos = np.repeat(np.arange(nP), 5); ypos = np.tile(np.arange(5), nP)
    ax.bar3d(xpos, ypos, np.zeros(nP * 5), 0.78, 0.78, Z.flatten(), color=[AGE_C[a] for a in ypos], shade=True, edgecolor=(0, 0, 0, 0.28), linewidth=0.1)
    xt = np.linspace(0, nP - 1, 6).astype(int); ax.set_xticks(xt); ax.set_xticklabels(["$%.3g" % px[i] for i in xt])
    ax.set_yticks(range(5)); ax.set_yticklabels(AGE_L)
    ax.set_xlabel("cost basis — price bought", color="#cbd5e1", fontsize=10, labelpad=12)
    ax.set_ylabel("holding age", color="#cbd5e1", fontsize=10, labelpad=10)
    ax.set_zlabel("% of supply", color="#cbd5e1", fontsize=9, labelpad=4)
    ax.view_init(elev=elev, azim=azim)
    buf = io.BytesIO(); plt.savefig(buf, facecolor="#0a0e1c", bbox_inches="tight", pad_inches=0.12); plt.close(); buf.seek(0)
    return compose(buf, "SPX6900 — cost basis × holding age", "where every coin was bought, and how long it's been held  ·  spot $%.3f" % u["spot"],
                   "spx6900rainbow.xyz  ·  fresh (red) → diamond 1y+ (cyan)  ·  on-chain FIFO, reproducible", name)

def hodl_series():
    oc = [r for r in load("public/onchain.json") if isinstance(r.get("age"), list) and len(r["age"]) == 5]
    return oc, np.array([r["age"] for r in oc])

def render_hodl(name="hodl3d.png"):
    oc, A = hodl_series(); T = len(oc)
    yrs = sorted(set(r["d"][:4] for r in oc)); yp = [next(i for i, r in enumerate(oc) if r["d"][:4] == y) for y in yrs]
    fig = plt.figure(figsize=(9.2, 6), dpi=150); fig.patch.set_facecolor("#0a0e1c")
    ax = fig.add_subplot(111, projection="3d"); style(ax)
    waterfall(ax, [A[:, a] for a in range(5)], AGE_C, [0, 1, 2, 3, 4], T)
    ax.set_xlim(0, T - 1); ax.set_ylim(-0.5, 4.5); ax.set_zlim(0, A.max() * 1.05)
    ax.set_xticks(yp); ax.set_xticklabels(yrs); ax.set_yticks(range(5)); ax.set_yticklabels(AGE_L)
    ax.set_zlabel("% of supply", color="#cbd5e1", fontsize=9, labelpad=2); ax.set_ylabel("holding age", color="#cbd5e1", fontsize=9, labelpad=8)
    ax.view_init(elev=30, azim=-62); ax.set_box_aspect((1.5, 1, 0.7), zoom=0.92)
    buf = io.BytesIO(); plt.savefig(buf, facecolor="#0a0e1c", bbox_inches="tight", pad_inches=0.12); plt.close(); buf.seek(0)
    return compose(buf, "SPX6900 — HODL Waves in 3D", "supply by holding age, over time  ·  the 1y+ diamond band swelling to %d%%" % round(A[-1, 4]),
                   "spx6900rainbow.xyz  ·  fresh (red) → 1y+ diamonds (cyan)  ·  on-chain FIFO, launch → now", name)

def render_ven(name="ven3d.png"):
    ven = [r for r in load("public/onchain.json") if r.get("cexVenues")]
    cur = ven[-1]["cexVenues"]; top = sorted(cur, key=lambda k: -cur[k])[:8]; T = len(ven)
    yrs = sorted(set(r["d"][:4] for r in ven)); yp = [next(i for i, r in enumerate(ven) if r["d"][:4] == y) for y in yrs]
    series = [np.array([r["cexVenues"].get(n, 0) / 1e6 for r in ven]) for n in top]
    fig = plt.figure(figsize=(9.2, 6), dpi=150); fig.patch.set_facecolor("#0a0e1c")
    ax = fig.add_subplot(111, projection="3d"); style(ax)
    waterfall(ax, series, VEN_PAL[:len(top)], list(range(len(top) - 1, -1, -1)), T)  # rank0 at back
    ax.set_xlim(0, T - 1); ax.set_ylim(-0.5, len(top) - 0.5); ax.set_zlim(0, max(s.max() for s in series) * 1.05)
    ax.set_xticks(yp); ax.set_xticklabels(yrs); ax.set_yticks(range(len(top))); ax.set_yticklabels(list(reversed(top)), fontsize=7)
    ax.set_zlabel("SPX (M)", color="#cbd5e1", fontsize=9, labelpad=2)
    ax.view_init(elev=28, azim=-60); ax.set_box_aspect((1.5, 1, 0.7), zoom=0.92)
    buf = io.BytesIO(); plt.savefig(buf, facecolor="#0a0e1c", bbox_inches="tight", pad_inches=0.12); plt.close(); buf.seek(0)
    return compose(buf, "SPX6900 — Exchange Supply by Venue in 3D", "SPX held per exchange, over time  ·  the Kraken ridge rising as it listed",
                   "spx6900rainbow.xyz  ·  tagged exchange wallets  ·  on-chain, reproducible", name)

def spin(which="cba", frames=60):
    """360° rotating MP4 + GIF of one chart (azimuth sweep)."""
    import imageio.v2 as imageio
    render = {"cba": render_cba}.get(which)
    if not render: print("spin supports: cba"); return
    imgs = [np.array(render(azim=-60 - i * 360 / frames, name="_f.png")) for i in range(frames)]
    imageio.mimsave(os.path.join(OUT, which + "_spin.mp4"), imgs, fps=20, quality=8, macro_block_size=1)
    g = [Image.fromarray(f).resize((760, 427)).quantize(colors=128) for f in imgs]
    g[0].save(os.path.join(OUT, which + "_spin.gif"), save_all=True, append_images=g[1:], duration=55, loop=0, disposal=2)
    print("wrote", which, "spin mp4+gif")

if __name__ == "__main__":
    if "--spin" in sys.argv:
        spin(sys.argv[sys.argv.index("--spin") + 1] if len(sys.argv) > sys.argv.index("--spin") + 1 else "cba")
    else:
        render_cba(); render_hodl(); render_ven()
        print("done — see tools/3d/out/")
