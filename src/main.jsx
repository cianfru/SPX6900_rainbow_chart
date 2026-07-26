import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import BtcAnalogExplorer from './BtcAnalogExplorer.jsx'

// Which build is on screen. Printed on every load so "the site looks stale" can be
// answered from the console without a round trip, and matched against /version.json.
if (typeof __BUILD__ !== 'undefined') {
  const b = __BUILD__
  console.log(`%c SPX6900 %c build ${b.sha} · ${b.ref} · ${b.builtAt} `,
    'background:#818cf8;color:#0b0b18;font-weight:700;border-radius:3px 0 0 3px',
    'background:#1e293b;color:#cbd5e1;border-radius:0 3px 3px 0')
  window.__BUILD__ = b
}

// Hidden, unlinked route for the exploratory BTC analog tool: open #btc-explorer.
const showExplorer = window.location.hash === '#btc-explorer'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {showExplorer ? <BtcAnalogExplorer /> : <App />}
    <Analytics />
  </StrictMode>,
)
