# 3D showcase renders — side project

Eye-catching **3D charts for hand-posted tweets** (the Node bot card pipeline can't do
3D/Python, so these are rendered separately and posted manually). All from the same
on-chain data the site uses (`public/onchain.json`, `public/urpd.json`).

```bash
pip install matplotlib numpy pillow imageio imageio-ffmpeg   # one-off
python3 tools/3d/render_3d.py            # → tools/3d/out/{cba,hodl3d,ven3d}.png
python3 tools/3d/render_3d.py --spin cba # → a 360° MP4 + GIF of the cost-basis×age chart
```

Charts (each has three genuine dimensions — two axes + magnitude):
- **cba** — cost basis × holding age × supply (also shipped as an interactive site chart, `Urpd3D.jsx`).
- **hodl** — HODL waves in 3D: time × age × supply (the standout — the diamond band swelling over the cycle).
- **ven** — exchange supply by venue: time × venue × supply (the Kraken ridge rising).

Backlog ideas (not built): URPD *terrain over time* (needs the FIFO engine to store weekly
URPD history), seasonality 3D calendar (year × month × return — data already in `src/data.js`).
Any of these can become a rotating MP4 via the `spin()` helper. `out/` is gitignored.
