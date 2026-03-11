import { motion } from 'framer-motion'

export default function StatCard({ icon, label, value, change, changeDir, colorClass = 'purple', delay = 0 }) {
    return (
        <motion.div
            className="stat-card glass"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
        >
            <div className="stat-card-header">
                <span className="stat-card-label">{label}</span>
                <div className={`stat-card-icon ${colorClass}`}>
                    {icon}
                </div>
            </div>
            <div className="stat-card-value">{value}</div>
            {change && (
                <div className={`stat-card-change ${changeDir || 'up'}`}>
                    {changeDir === 'down' ? '↓' : '↑'} {change}
                </div>
            )}
        </motion.div>
    )
}
