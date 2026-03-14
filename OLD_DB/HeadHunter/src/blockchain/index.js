// ── src/blockchain/index.js ──
// Barrel export for all blockchain-related modules.

export { TonWalletProvider, useTonWalletContext } from './TonWalletContext'
export { default as WalletConnectButton } from './WalletConnectButton'
export * from './BlockchainService'
export { validateTonAddress, isValidTonAddress, shortenAddress } from './addressValidator'
