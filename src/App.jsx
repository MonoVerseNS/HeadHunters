import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppLayout from './components/Layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import NFTPage from './pages/NFTPage'
import CreateNFTPage from './pages/CreateNFTPage'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'
import ApiPage from './pages/ApiPage'
import ClickerPage from './pages/ClickerPage'
import LeaderboardPage from './pages/LeaderboardPage'
import DonatePage from './pages/DonatePage'

function ProtectedRoute({ children }) {
    const { isAuthenticated, isLoading } = useAuth()
    if (isLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div className="loading-shimmer" style={{
                    width: 160,
                    height: 40,
                    borderRadius: 'var(--radius-md)'
                }} />
            </div>
        )
    }
    return isAuthenticated ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
    const { isAdmin } = useAuth()
    return isAdmin ? children : <Navigate to="/" replace />
}

export default function App() {
    const { isAuthenticated } = useAuth()

    return (
        <Routes>
            <Route
                path="/login"
                element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
            />
            <Route path="/api/:userId" element={<ApiPage />} />
            <Route
                element={
                    <ProtectedRoute>
                        <AppLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<DashboardPage />} />
                <Route path="nft" element={<NFTPage />} />
                <Route path="nft/create" element={<CreateNFTPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="clicker" element={<ClickerPage />} />
                <Route path="leaderboard" element={<LeaderboardPage />} />
                <Route path="donate" element={<DonatePage />} />
                <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
