import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { FiGrid, FiImage, FiUser, FiCreditCard, FiAward, FiShield } from 'react-icons/fi'

export default function MobileBottomNav() {
    const { isAdmin } = useAuth()

    const items = [
        { path: '/', icon: <FiGrid size={20} />, label: 'Главная' },
        { path: '/nft', icon: <FiImage size={20} />, label: 'Маркет' },
        { path: '/clicker', icon: <FiCreditCard size={20} />, label: 'Кликер' },
        { path: '/leaderboard', icon: <FiAward size={20} />, label: 'Лидеры' },
        { path: '/donate', icon: <span style={{ fontSize: '20px' }}>❤️</span>, label: 'Донат' },
        { path: '/profile', icon: <FiUser size={20} />, label: 'Профиль' },
    ]

    if (isAdmin) {
        items.push({ path: '/admin', icon: <FiShield size={20} />, label: 'Админ' })
    }

    return (
        <nav className="mobile-bottom-nav">
            {items.map(item => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
                    end={item.path === '/'}
                >
                    {item.icon}
                    <span>{item.label}</span>
                </NavLink>
            ))}
        </nav>
    )
}
