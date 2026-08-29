import { useState } from "react";
import { useHoverType } from "./chart-ui.jsx";
import { useFavs } from "./favs.js";
import { DF_BY_HREF } from "./deep-field-charts.js";

// GLOBAL FAVORITES CORNER — a members' watchlist pinned to the left edge of the whole site, so the
// charts you star on Deep Field are one tap away from anywhere. Same design language as the nav: mono,
// uppercase, a left-border accent, and the name types itself out on hover (no icons, no pills). Reads
// the SAME favorites set as the Deep Field stars (src/favs.js), so pinning/unpinning stays in sync.

function FavRow({ name, href, onUnpin }) {
  const { shown, type, reset } = useHoverType(name);
  return (
    <a href={href} className="favrow" onMouseEnter={type} onMouseLeave={reset} onFocus={type} onBlur={reset}>
      <button type="button" className="favstar" title={"Unpin " + name} aria-label={"Unpin " + name}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onUnpin(); }}>★</button>
      <span className="favname">
        <span className="favg" aria-hidden="true">{name}<i className="favcur">_</i></span>
        <span className="favy">{shown}<i className="favcur">_</i></span>
      </span>
      <span className="favarrow">↗</span>
    </a>
  );
}

export default function FavoritesLauncher({ me }) {
  const [favs, toggle] = useFavs();
  const [open, setOpen] = useState(false);

  // The corner belongs to a logged-in member (it's their watchlist). Signed-out visitors don't see it.
  if (!me?.loggedIn) return null;

  const pinned = [...favs].map(h => DF_BY_HREF.get(h)).filter(Boolean);

  return (
    <div className={"favlaunch" + (open ? " open" : "")}>
      <button className="favtab" onClick={() => setOpen(o => !o)} aria-expanded={open ? "true" : "false"}
        aria-label={open ? "Hide your favorite charts" : "Your favorite charts"}>
        <span className="favtab-star">★</span>
        <span className="favtab-lbl">FAVORITES{pinned.length ? " · " + pinned.length : ""}</span>
      </button>

      {open && <div className="favscrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="favpanel" role="dialog" aria-label="Your favorite charts" hidden={!open}>
        <div className="favhead">
          <span>★ your charts</span>
          <button className="favclose" onClick={() => setOpen(false)} aria-label="Close">×</button>
        </div>
        {pinned.length ? (
          <div className="favlist">
            {pinned.map(c => <FavRow key={c.href} name={c.name} href={c.href} onUnpin={() => toggle(c.href)} />)}
          </div>
        ) : (
          <div className="favempty">
            Nothing pinned yet. Open <a href="/deepfield">Deep&nbsp;Field</a> and tap the <b>☆</b> on any chart to pin it here.
          </div>
        )}
      </div>
    </div>
  );
}
