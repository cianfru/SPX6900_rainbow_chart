import { useState, useEffect, useRef } from "react";

// LIVE spot price from Kraken's public WebSocket v2 (wss, no auth for market data). Subscribes to the
// `ticker` channel for a pair and streams live last price + 24h change/high/low/volume into the browser.
// No backend, no webhook: Kraken has no outbound webhook, but its WS is public, so the client connects
// directly and the static site stays static. Kraken is the largest SPX venue and, unlike Binance, isn't
// geo-blocked. The caller falls back to its banked/model price via the `connected` flag.
//
// Confirmed ticker shape (2026-08, SPX/USD):
//   { symbol:"SPX/USD", last:0.3281, change_pct:1.64, high:0.334, low:0.3177, volume:461671.28, ... }
const KR_WS = "wss://ws.kraken.com/v2";

export function useKrakenLive(symbol = "SPX/USD", enabled = true) {
  const [state, setState] = useState({ connected: false, last: null, changePct: null, high: null, low: null, vlm: null, ts: null });
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const deadRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return;
    deadRef.current = false;

    const scheduleRetry = () => {
      if (deadRef.current) return;
      const n = Math.min(retryRef.current++, 5);
      setTimeout(connect, Math.min(1000 * 2 ** n, 30000)); // exponential backoff, capped 30s
    };

    function connect() {
      if (deadRef.current) return;
      let ws;
      try { ws = new WebSocket(KR_WS); } catch { scheduleRetry(); return; }
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        try { ws.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: [symbol] } })); } catch { /* closed under us */ }
      };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.channel !== "ticker" || !Array.isArray(m.data) || !m.data.length) return; // ignore status/heartbeat/ack
        const d = m.data.find(x => x.symbol === symbol) || m.data[0];
        const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
        setState({ connected: true, last: num(d.last), changePct: num(d.change_pct), high: num(d.high), low: num(d.low), vlm: num(d.volume), ts: Date.now() });
      };
      ws.onclose = () => { if (!deadRef.current) setState(s => ({ ...s, connected: false })); scheduleRetry(); };
      ws.onerror = () => { try { ws.close(); } catch { /* */ } };
    }

    connect();
    return () => {
      deadRef.current = true;
      try { wsRef.current?.close(); } catch { /* */ }
    };
  }, [symbol, enabled]);

  return state;
}
