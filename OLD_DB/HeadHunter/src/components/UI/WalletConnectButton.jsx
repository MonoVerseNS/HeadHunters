// ── WalletConnectButton ──
// Compact header button for TON wallet connection.
// Shows truncated address when connected, "Connect" when not.
import { useState, useRef, useEffect } from 'react'
import { useTonWalletContext } from '../../blockchain/TonWalletContext'

export default function WalletConnectButton() {
    const {
        connected, address, shortAddress, walletName,
        connect, disconnect, txPending
    } = useTonWalletContext()

    const [dropdownOpen, setDropdownOpen] = useState(false)
    const ref = useRef(null)

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setDropdownOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

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
            </button>

            {dropdownOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    minWidth: '260px',
                    background: 'rgba(13, 13, 30, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 152, 234, 0.2)',
                    borderRadius: '12px',
                    padding: '16px',
                    zIndex: 1000,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                }}>
                    {/* Wallet name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #0098EA, #00B2FF)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '14px',
                        }}>💎</div>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{walletName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Подключён</div>
                        </div>
                    </div>

                    {/* Address */}
                    <div style={{
                        background: 'rgba(255,255,255,0.05)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                    }}>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {address}
                        </span>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                                navigator.clipboard.writeText(address)
                                setDropdownOpen(false)
                            }}
                            style={{ padding: '4px 8px', fontSize: '10px', flexShrink: 0 }}
                        >
                            📋
                        </button>
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
                </div>
            )}
        </div>
    )
}
