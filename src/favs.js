// Shared "favorite charts" state — a members' watchlist, pinned per-account.
// Stored in localStorage (`df-favs`, instant + per-device) AND in KV via /api/auth?action=fav
// (per-account, syncs across devices once logged in). One hook so the Deep Field page's stars and the
// global favorites launcher read/write the SAME set and update each other live (a cross-component
// `spx-favs` event + the native `storage` event for other tabs).
import { useState, useEffect, useCallback } from "react";

export const FAVS_KEY = "df-favs";

export function readFavs() {
  try { const a = JSON.parse(localStorage.getItem(FAVS_KEY) || "[]"); return new Set(Array.isArray(a) ? a : []); }
  catch { return new Set(); }
}

function persist(set) {
  const arr = [...set];
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(arr)); } catch { /* private mode */ }
  // per-account (fire-and-forget; localStorage is the offline cache/fallback)
  fetch("/api/auth?action=fav", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fav: arr }) }).catch(() => {});
  try { window.dispatchEvent(new CustomEvent("spx-favs")); } catch { /* SSR */ }
}

export function useFavs() {
  const [favs, setFavs] = useState(readFavs);

  useEffect(() => {
    let off = false;
    // reconcile to the member's KV list once known (source of truth across devices)
    fetch("/api/auth?action=me", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (off || !d?.loggedIn || !Array.isArray(d.fav)) return;
      const s = new Set(d.fav);
      try { localStorage.setItem(FAVS_KEY, JSON.stringify(d.fav)); } catch { /* private */ }
      setFavs(s);
    }).catch(() => {});
    // stay in sync with the other star/launcher and with other tabs
    const sync = () => setFavs(readFavs());
    window.addEventListener("spx-favs", sync);
    window.addEventListener("storage", e => { if (!e || e.key === FAVS_KEY) sync(); });
    return () => { off = true; window.removeEventListener("spx-favs", sync); };
  }, []);

  const toggle = useCallback(href => {
    setFavs(prev => { const next = new Set(prev); next.has(href) ? next.delete(href) : next.add(href); persist(next); return next; });
  }, []);

  return [favs, toggle];
}
