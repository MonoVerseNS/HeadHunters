import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { TonConnectUIProvider } from '@tonconnect/ui-react'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { WalletProvider } from './context/WalletContext.jsx'
import { TonWalletProvider } from './blockchain/TonWalletContext.jsx'
import { ToastProvider } from './components/UI/Toast.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { CONFIG } from './config'
import './index.css'

// ── Fetch public config from server ──
async function initApp() {
  try {
    const res = await fetch('/api/config')
    const remoteConfig = await res.json()
    if (remoteConfig) {
      if (remoteConfig.telegram?.botUsername) CONFIG.telegram.botId = remoteConfig.telegram.botUsername
      if (remoteConfig.ton?.network) CONFIG.ton.network = remoteConfig.ton.network
      if (remoteConfig.ton?.nftCollectionAddress) CONFIG.ton.nftContractAddress = remoteConfig.ton.nftCollectionAddress
      if (remoteConfig.ton?.jettonMasterAddress) CONFIG.ton.jettonMasterAddress = remoteConfig.ton.jettonMasterAddress
      if (remoteConfig.ton?.platformWalletAddress) {
        CONFIG.ton.platformAddress = remoteConfig.ton.platformWalletAddress
        CONFIG.wallet.address = remoteConfig.ton.platformWalletAddress
      }
      if (remoteConfig.app?.name) CONFIG.platform.name = remoteConfig.app.name
      if (remoteConfig.app?.currency) CONFIG.platform.currency = remoteConfig.app.currency
    }
  } catch (e) {
    console.warn('[HH] Failed to fetch remote config:', e)
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <SafeTonConnectProvider>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <WalletProvider>
                <TonWalletProvider>
                  <App />
                </TonWalletProvider>
              </WalletProvider>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </SafeTonConnectProvider>
    </ErrorBoundary>
  )
}

initApp()

// ── Global error handlers — prevent Telegram WebView crash ──
window.addEventListener('error', (e) => {
  console.error('[HH] Global error:', e.message, e.filename, e.lineno)
  e.preventDefault()
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[HH] Unhandled rejection:', e.reason)
  e.preventDefault()
})

const manifestUrl = window.location.origin + '/tonconnect-manifest.json'

// Detect Telegram Mini App
const isMiniApp = !!window.Telegram?.WebApp?.initDataUnsafe?.user

// Force dark theme on Telegram Mini Apps
if (window.Telegram?.WebApp) {
  document.documentElement.style.setProperty('color-scheme', 'dark')
  document.body.style.backgroundColor = '#06060e'
  try {
    window.Telegram.WebApp.setHeaderColor('#06060e')
    window.Telegram.WebApp.setBackgroundColor('#06060e')
  } catch (e) { /* older API */ }
}

// Wrapper — skip TonConnect in Mini App to prevent mobile WebView crash
function SafeTonConnectProvider({ children }) {
  if (isMiniApp) {
    return <>{children}</>
  }
  try {
    return (
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        {children}
      </TonConnectUIProvider>
    )
  } catch (e) {
    console.warn('[HH] TonConnect init failed:', e)
    return <>{children}</>
  }
}

