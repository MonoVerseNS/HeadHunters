import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
    FiGrid, FiImage, FiCreditCard, FiUser,
    FiShield, FiLogOut, FiAward
} from 'react-icons/fi'
import UserAvatar from '../UI/UserAvatar'

const navItems = [
    { path: '/', icon: <FiGrid />, label: 'Дашборд' },
    { path: '/nft', icon: <FiImage />, label: 'NFT Аукцион' },
    { path: '/profile', icon: <FiUser />, label: 'Профиль' },
    { path: '/clicker', icon: <FiCreditCard />, label: '🎮 Кликер' },
    { path: '/leaderboard', icon: <FiAward />, label: '🏆 Лидеры' },
    { path: '/donate', icon: <span style={{ fontSize: '16px' }}>❤️</span>, label: 'Пожертвования' },
]

const adminItems = [
    { path: '/admin', icon: <FiShield />, label: 'Модерация' },
]

export default function Sidebar() {
    const { user, isAdmin, logout } = useAuth()

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-text">
                    Head<span>Hunters</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <span className="sidebar-section-label">Платформа</span>
                {navItems.map(item => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                        end={item.path === '/'}
                    >
                        <span className="sidebar-link-icon">{item.icon}</span>
                        {item.label}
                    </NavLink>
                ))}

                {isAdmin && (
                    <>
                        <span className="sidebar-section-label" style={{ marginTop: '0.5rem' }}>Управление</span>
                        {adminItems.map(item => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            >
                                <span className="sidebar-link-icon">{item.icon}</span>
                                {item.label}
                            </NavLink>
                        ))}
                    </>
                )}
            </nav>

            <div className="sidebar-footer">
                <div className="sidebar-user" onClick={logout} title="Выйти">
                    <div className="sidebar-user-avatar">
                        <UserAvatar user={user} />
                    </div>
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{user?.username || 'Гость'}</div>
                        <div className="sidebar-user-role">{isAdmin ? 'Администратор' : 'Пользователь'}</div>
                    </div>
                    <FiLogOut style={{ color: 'var(--color-text-muted)' }} />
                </div>
            </div>
        </aside>
    )
}
