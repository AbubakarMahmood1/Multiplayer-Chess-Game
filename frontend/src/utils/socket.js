import { io } from 'socket.io-client';

let socket;
let reconnectTimer = null;
let activeGameId = null;
let activeUserId = null;
let reconnectionAttempts = 0;
const MAX_RECONNECTION_ATTEMPTS = 10;

export const setActiveGame = (gameId, userId) => {
  activeGameId = gameId;
  activeUserId = userId;
  console.log(`Active game set to ${gameId} for user ${userId}`);
};

export const clearActiveGame = () => {
  activeGameId = null;
  activeUserId = null;
  reconnectionAttempts = 0;
};

export const initSocket = () => {
  if (!socket || !socket.connected) {
    socket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
      reconnectionDelay: 1000,
      timeout: 20000,
      transports: ['websocket', 'polling']
    });
    
    socket.on('connect', () => {
      console.log('Socket connected with ID:', socket.id);
      
      // Reset reconnection attempts counter
      reconnectionAttempts = 0;
      
      // If we were in a game before disconnection, rejoin it
      if (activeGameId && activeUserId) {
        console.log(`Reconnecting to game ${activeGameId}`);
        // Rejoin the game room
        socket.emit('rejoin_game', { 
          gameId: activeGameId, 
          userId: activeUserId 
        });
        
        // Send heartbeats immediately and repeatedly for 10 seconds to ensure activity is registered
        const initialHeartbeatInterval = setInterval(() => {
          if (socket.connected) {
            socket.emit('heartbeat', {
              gameId: activeGameId,
              userId: activeUserId
            });
          }
        }, 1000);
        
        // Clear the initial heartbeat interval after 15 seconds
        setTimeout(() => {
          clearInterval(initialHeartbeatInterval);
        }, 15000);
      }
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      attemptReconnection();
    });
    
    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      // Attempt reconnection regardless of the disconnect reason
      attemptReconnection();
    });
  }
  return socket;
};

function attemptReconnection() {
  // Clear any existing reconnection timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  
  reconnectionAttempts++;
  
  // Use exponential backoff for reconnection attempts
  const delay = Math.min(1000 * Math.pow(2, reconnectionAttempts), 30000);
  
  if (reconnectionAttempts <= MAX_RECONNECTION_ATTEMPTS) {
    console.log(`Attempting reconnection ${reconnectionAttempts}/${MAX_RECONNECTION_ATTEMPTS} in ${delay}ms`);
    
    reconnectTimer = setTimeout(() => {
      if (!socket.connected) {
        socket.connect();
      }
    }, delay);
  } else {
    console.error('Max reconnection attempts reached');
  }
}

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) socket.disconnect();
};