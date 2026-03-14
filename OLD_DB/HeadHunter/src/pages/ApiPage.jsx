import { useParams } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { useAuth } from '../context/AuthContext'
import { FiShield, FiAlertTriangle } from 'react-icons/fi'

export default function ApiPage() {
    const { userId } = useParams()
    const { allNFTs, balance } = useWallet()
    const { allUsers } = useAuth()

    const targetUser = allUsers.find(u => u.id === userId || u.telegramId === userId)

    if (!targetUser) {
        return (
            <div style={{ padding: '40px', fontFamily: 'monospace', background: '#0a0a14', color: '#ef4444', minHeight: '100vh' }}>
                <h2>404 — User Not Found</h2>
                <pre>{JSON.stringify({ error: 'User not found', userId }, null, 2)}</pre>
            </div>
        )
    }

    // Get user's NFTs, filter out banned ones
    const userNFTs = allNFTs
        .filter(n => n.ownerId === targetUser.id && n.status !== 'banned' && n.status !== 'hidden')
        .map(n => ({
            id: n.id,
            name: n.name,
            image: n.image || null,
            emoji: n.emoji || null,
            collection: n.collectionName || null,
            createdAt: n.history?.[0]?.date || null,
        }))

    const userBalance = balance // This is current user's balance, but we want target user's
    // For API we need to read from state directly — use allNFTs context doesn't expose other balances
    // We'll show NFT count instead of balance for non-self users (security)

    const apiResponse = {
        ok: true,
        user: {
            id: targetUser.id,
            username: targetUser.username,
            firstName: targetUser.firstName,
            avatar: targetUser.avatar,
            status: targetUser.status,
            role: targetUser.role,
            registeredAt: targetUser.registeredAt,
        },
        gifts: userNFTs,
        giftsCount: userNFTs.length,
        isBanned: targetUser.status === 'blocked',
    }

    return (
        <div style={{
            padding: '40px', fontFamily: '"Inter", monospace', background: '#0a0a14',
            color: '#e0e0e0', minHeight: '100vh'
        }}>
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <FiShield style={{ color: '#22c55e' }} />
                    <h2 style={{ margin: 0, fontSize: '18px' }}>HeadHunters Public API</h2>
                    <span style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(34,197,94,0.2)', color: '#22c55e', borderRadius: '4px' }}>v1</span>
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
                    GET /api/{userId}
                </div>

                {targetUser.status === 'blocked' && (
                    <div style={{ padding: '12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontSize: '13px' }}>
                        <FiAlertTriangle /> Этот пользователь заблокирован
                    </div>
                )}

                <pre style={{
                    background: '#111122', border: '1px solid #222244', borderRadius: '12px',
                    padding: '20px', fontSize: '13px', lineHeight: 1.6, overflowX: 'auto',
                    color: '#a0f0a0'
                }}>
                    {JSON.stringify(apiResponse, null, 2)}
                </pre>

                <div style={{ marginTop: '24px', fontSize: '11px', color: '#666' }}>
                    Ответ содержит публичные данные пользователя и список подарков (NFT).
                    Забаненные NFT скрыты.
                </div>
            </div>
        </div>
    )
}
