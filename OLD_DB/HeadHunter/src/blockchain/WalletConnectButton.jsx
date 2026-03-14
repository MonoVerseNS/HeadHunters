// ────────────────────────────────────────────────
// Enhanced WalletConnectButton
// ────────────────────────────────────────────────
// Shows real TON/HH balances and NFT count in dropdown.
import { useState, useRef, useEffect } from 'react'
import { useTonWalletContext } from './TonWalletContext'

export default function WalletConnectButton() {
    const {
        connected, address, shortAddress, walletName,
        connect, disconnect, txPending,
        tonBalance, hhBalance, allWalletNfts,
        hhNfts, telegramNfts, otherNfts,
        balanceLoading, refreshBalances, lastRefresh,
        tonConnectAvailable,
    } = useTonWalletContext()

    const [dropdownOpen, setDropdownOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setDropdownOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Hide in Telegram Mini App (no TonConnect SDK)
    if (!tonConnectAvailable) return null

    if (!connected) {
        return (
            <button
                className="btn btn-sm"
                onClick={connect}
                style={{
                    background: 'linear-gradient(135deg, #0098EA, #00B2FF)',
                    color: 'white',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 152, 234, 0.3)',
                    transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 152, 234, 0.5)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 152, 234, 0.3)'}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Connect Wallet
            </button>
        )
    }

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                className="btn btn-sm"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                    background: 'rgba(0, 152, 234, 0.15)',
                    color: '#00B2FF',
                    border: '1px solid rgba(0, 152, 234, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                }}
            >
                <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: txPending ? '#f59e0b' : '#22c55e',
                    boxShadow: txPending ? '0 0 6px #f59e0b' : '0 0 6px #22c55e',
                    animation: txPending ? 'pulse 1s infinite' : 'none',
                }} />
                {shortAddress}
                {tonBalance > 0 && (
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>
                        {tonBalance.toFixed(2)} 💎
                    </span>
                )}
            </button>

            {dropdownOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    minWidth: '300px',
                    background: 'rgba(13, 13, 30, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 152, 234, 0.2)',
                    borderRadius: '14px',
                    padding: '16px',
                    zIndex: 1000,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                }}>
                    {/* Wallet Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0098EA, #00B2FF)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '16px',
                        }}>💎</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{walletName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Подключён</div>
                        </div>
                        <button
                            onClick={() => { refreshBalances(); }}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: balanceLoading ? '#0098EA' : 'var(--color-text-muted)',
                                fontSize: '14px',
                                animation: balanceLoading ? 'spin 1s linear infinite' : 'none',
                            }}
                            title="Обновить балансы"
                        >🔄</button>
                    </div>

                    {/* Address */}
                    <div style={{
                        background: 'rgba(255,255,255,0.05)',
                        padding: '8px 12px', borderRadius: '8px',
                        marginBottom: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                    }}>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {address}
                        </span>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { navigator.clipboard.writeText(address) }}
                            style={{ padding: '4px 8px', fontSize: '10px', flexShrink: 0 }}
                        >📋</button>
                    </div>

                    {/* ── Balances ── */}
                    <div style={{
                        background: 'rgba(0, 152, 234, 0.06)',
                        border: '1px solid rgba(0, 152, 234, 0.12)',
                        borderRadius: '10px',
                        padding: '12px',
                        marginBottom: '14px',
                    }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Балансы
                        </div>

                        {/* TON */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                💎 <span style={{ fontWeight: 600 }}>TON</span>
                            </span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#00B2FF' }}>
                                {tonBalance.toFixed(4)}
                            </span>
                        </div>

                        {/* HH */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                🪙 <span style={{ fontWeight: 600 }}>HH</span>
                            </span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffd700' }}>
                                {hhBalance.toFixed(2)}
                            </span>
                        </div>

                        {/* Other jettons (if any) */}
                        {/* Only show top 2 non-HH jettons */}
                        {/* jettons is from context, filter out HH */}
                    </div>

                    {/* ── NFTs Summary ── */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '10px',
                        padding: '12px',
                        marginBottom: '14px',
                    }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            NFT ({allWalletNfts.length})
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {hhNfts.length > 0 && (
                                <span style={{
                                    fontSize: '11px',
                                    background: 'rgba(0, 152, 234, 0.12)',
                                    color: '#00B2FF',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                }}>
                                    🎯 HH: {hhNfts.length}
                                </span>
                            )}
                            {telegramNfts.length > 0 && (
                                <span style={{
                                    fontSize: '11px',
                                    background: 'rgba(88, 166, 255, 0.12)',
                                    color: '#58a6ff',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                }}>
                                    ✈️ TG: {telegramNfts.length}
                                </span>
                            )}
                            {otherNfts.length > 0 && (
                                <span style={{
                                    fontSize: '11px',
                                    background: 'rgba(255,255,255,0.06)',
                                    color: '#aaa',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                }}>
                                    🖼️ Другие: {otherNfts.length}
                                </span>
                            )}
                            {allWalletNfts.length === 0 && (
                                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                    Нет NFT на кошельке
                                </span>
                            )}
                        </div>

                        {/* Preview first 3 NFTs */}
                        {allWalletNfts.length > 0 && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                {allWalletNfts.slice(0, 4).map((nft, i) => (
                                    <div key={i} style={{
                                        width: '56px', height: '56px', borderRadius: '8px',
                                        overflow: 'hidden',
                                        border: nft.isTelegram ? '1px solid rgba(88, 166, 255, 0.3)' :
                                            nft.isHeadHunters ? '1px solid rgba(0, 152, 234, 0.3)' :
                                                '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(0,0,0,0.3)',
                                    }}>
                                        {nft.image ? (
                                            <img src={nft.image} alt={nft.name}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={e => { e.target.style.display = 'none' }}
                                            />
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '16px' }}>
                                                🖼️
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {allWalletNfts.length > 4 && (
                                    <div style={{
                                        width: '56px', height: '56px', borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.05)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '11px', color: 'var(--color-text-muted)',
                                    }}>
                                        +{allWalletNfts.length - 4}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Disconnect */}
                    <button
                        onClick={() => { disconnect(); setDropdownOpen(false) }}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            color: '#ef4444',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                    >
                        🔌 Отключить кошелёк
                    </button>

                    {/* Last refresh */}
                    {lastRefresh && (
                        <div style={{ fontSize: '9px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '8px' }}>
                            Обновлено: {new Date(lastRefresh).toLocaleTimeString()}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
