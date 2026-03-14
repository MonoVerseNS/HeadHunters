import React from 'react'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo })
        console.error('[HH] Uncaught error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '20px',
                    color: '#f87171',
                    background: '#06060e',
                    height: '100vh',
                    fontFamily: 'Inter, sans-serif',
                }}>
                    <h1 style={{ marginBottom: '12px' }}>⚠️ Ошибка приложения</h1>
                    <p style={{ color: '#94a3b8', marginBottom: '12px' }}>
                        Попробуйте перезагрузить страницу
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '8px 20px',
                            background: '#ef4444',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            marginBottom: '16px',
                        }}
                    >
                        Перезагрузить
                    </button>
                    <details style={{ whiteSpace: 'pre-wrap', color: '#4b5563', fontSize: '12px' }}>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
