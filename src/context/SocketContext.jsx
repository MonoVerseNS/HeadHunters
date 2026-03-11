import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
    const { user, isAuthenticated } = useAuth()
    const [socket, setSocket] = useState(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        // Connect to the current host
        const newSocket = io(window.location.origin, {
            transports: ['websocket'],
            autoConnect: true
        })

        newSocket.on('connect', () => {
            console.log('[WS] Connected to server')
            setIsConnected(true)
        })

        newSocket.on('disconnect', () => {
            console.log('[WS] Disconnected from server')
            setIsConnected(false)
        })

        setSocket(newSocket)

        return () => newSocket.close()
    }, [])

    // Join user room when authenticated
    useEffect(() => {
        if (socket && isAuthenticated && user?.id) {
            socket.emit('join_user', user.id)
            console.log(`[WS] Joined user room: user_${user.id}`)
        }
    }, [socket, isAuthenticated, user?.id])

    const joinAuction = useCallback((auctionId) => {
        if (socket) {
            socket.emit('join_auction', auctionId)
            console.log(`[WS] Joined auction room: auction_${auctionId}`)
        }
    }, [socket])

    const leaveAuction = useCallback((auctionId) => {
        if (socket) {
            // Socket.io handles room leaving on disconnect or manual leave
            // but we can add an explicit leave if needed on the server side
            socket.emit('leave_auction', auctionId)
        }
    }, [socket])

    return (
        <SocketContext.Provider value={{ socket, isConnected, joinAuction, leaveAuction }}>
            {children}
        </SocketContext.Provider>
    )
}

export function useSocket() {
    return useContext(SocketContext)
}
