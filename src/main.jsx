import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import BtcAnalogExplorer from './BtcAnalogExplorer.jsx'
import Maintenance from './Maintenance.jsx'

// ── "We're rebuilding" curtain ──────────────────────────────────────────────
// While the redesign is finished IN production, the public sees the Maintenance
// page; the owner bypasses with a token. Visit ?preview=<TOKEN> once to persist
// access (localStorage), then browse normally. Flip MAINTENANCE to false (or delete
// this block) to launch publicly. TOKEN is a UX curtain, not security.
const MAINTENANCE = true
const PREVIEW_TOKEN = 'spx-rebuild-2026'
function previewUnlocked() {
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.get('preview') === PREVIEW_TOKEN) {
      localStorage.setItem('spx_preview', PREVIEW_TOKEN)
      p.delete('preview')
      const qs = p.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash)
    }
    return localStorage.getItem('spx_preview') === PREVIEW_TOKEN
  } catch { return false }
}

// Which build is on screen. Printed on every load so "the site looks stale" can be
// answered from the console without a round trip, and matched against /version.json.
if (typeof __BUILD__ !== 'undefined') {
  const b = __BUILD__
  console.log(`%c SPX6900 %c build ${b.sha} · ${b.ref} `,
    'background:#818cf8;color:#0b0b18;font-weight:700;border-radius:3px 0 0 3px',
    'background:#1e293b;color:#cbd5e1;border-radius:0 3px 3px 0')
  window.__BUILD__ = b
}

// Hidden, unlinked route for the exploratory BTC analog tool: open #btc-explorer.
const showExplorer = window.location.hash === '#btc-explorer'
const gated = MAINTENANCE && !previewUnlocked()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {gated
      ? <Maintenance token={PREVIEW_TOKEN} />
      : (showExplorer ? <BtcAnalogExplorer /> : <App />)}
    {!gated && <Analytics />}
  </StrictMode>,
)
