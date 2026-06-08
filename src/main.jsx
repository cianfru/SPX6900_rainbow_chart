import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import BtcAnalogExplorer from './BtcAnalogExplorer.jsx'

// Hidden, unlinked route for the exploratory BTC analog tool: open #btc-explorer.
const showExplorer = window.location.hash === '#btc-explorer'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {showExplorer ? <BtcAnalogExplorer /> : <App />}
    <Analytics />
  </StrictMode>,
)
