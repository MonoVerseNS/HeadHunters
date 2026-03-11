import { createContext, useContext, useState, useCallback } from 'react'
import { FiCheckCircle, FiAlertCircle, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi'

const ToastContext = createContext(null)

const ICONS = {
    success: FiCheckCircle,
    error: FiAlertCircle,
    warning: FiAlertTriangle,
    info: FiInfo
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])

    const addToast = useCallback((message, type = 'info', duration = 3500) => {
        console.log('[TOAST]', type, ':', JSON.stringify(message))
        if (!message) console.trace('[TOAST] EMPTY message! Stack:')
        const id = Date.now() + Math.random()
        setToasts(prev => [...prev, { id, message: message || '(пустое сообщение)', type }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
    }, [])

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="toast-container">
                {toasts.map(toast => {
                    const Icon = ICONS[toast.type] || FiInfo
                    return (
                        <div key={toast.id} className={`toast ${toast.type}`}>
                            <Icon className="toast-icon" />
                            <span className="toast-message">{toast.message}</span>
                            <button
                                onClick={() => removeToast(toast.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    display: 'flex'
                                }}
                            >
                                <FiX />
                            </button>
                        </div>
                    )
                })}
            </div>
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) throw new Error('useToast must be used within ToastProvider')
    return context
}
