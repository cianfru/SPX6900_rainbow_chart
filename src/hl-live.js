import { useState, useEffect, useRef } from "react";

// LIVE market pulse from Hyperliquid's public WebSocket (wss, no auth for market data). We subscribe to
// `activeAssetCtx` for the coin and stream its live context — funding (hourly rate), open interest,
// mark price and 24h volume — straight into the browser. No backend, no webhook: Hyperliquid has no
// outbound webhook, but its WS is public, so the client connects directly and the static site stays
// static. The daily banker still owns the HISTORY; this only refreshes the leading-edge "now".
//
// Confirmed message shape (2026-08, coin "SPX"):
//   { channel:"activeAssetCtx", data:{ coin:"SPX", ctx:{ funding:"0.0000125", openInterest:"6699937.8",
//     markPx:"0.32696", midPx:"0.32702", oraclePx:"0.32715", dayNtlVlm:"720557.19", prevDayPx:"0.3222" }}}
// funding is the HOURLY rate → APR = funding × 24 × 365 × 100.
const HL_WS = "wss://api.hyperliquid.xyz/ws";

export function useHyperliquidLive(coin = "SPX", enabled = true) {
  const [state, setState] = useState({ connected: false, funding: null, oi: null, markPx: null, vlm: null, prevDayPx: null, ts: null });
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const deadRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return;
    deadRef.current = false;
    let ping = null;

    const scheduleRetry = () => {
      if (deadRef.current) return;
      const n = Math.min(retryRef.current++, 5);
      setTimeout(connect, Math.min(1000 * 2 ** n, 30000)); // exponential backoff, capped 30s
    };

    function connect() {
      if (deadRef.current) return;
      let ws;
      try { ws = new WebSocket(HL_WS); } catch { scheduleRetry(); return; }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        try { ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "activeAssetCtx", coin } })); } catch { /* closed under us */ }
        // HL drops idle sockets after ~60s; a heartbeat keeps it warm even if ctx updates go quiet.
        ping = setInterval(() => { if (ws.readyState === 1) { try { ws.send(JSON.stringify({ method: "ping" })); } catch { /* */ } } }, 30000);
      };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.channel !== "activeAssetCtx" || msg.data?.coin !== coin) return;
        const c = msg.data.ctx || {};
        const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
        setState({
          connected: true,
          funding: num(c.funding),
          oi: num(c.openInterest),
          markPx: num(c.markPx ?? c.midPx ?? c.oraclePx),
          vlm: num(c.dayNtlVlm),
          prevDayPx: num(c.prevDayPx),
          ts: Date.now(),
        });
      };
      ws.onclose = () => { clearInterval(ping); if (!deadRef.current) setState(s => ({ ...s, connected: false })); scheduleRetry(); };
      ws.onerror = () => { try { ws.close(); } catch { /* */ } };
    }

    connect();
    return () => {
      deadRef.current = true;
      clearInterval(ping);
      try { wsRef.current?.close(); } catch { /* */ }
    };
  }, [coin, enabled]);

  return state;
}
