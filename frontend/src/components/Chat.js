import React, { useState, useEffect, useRef } from 'react';
import '../styles/Chat.css';

function Chat({ socket, gameId, isSpectator }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Load user data at component mount
  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);
    setIsLoggedIn(!!userData.id);
  }, []);

  // Handle socket messages
  useEffect(() => {
    if (socket) {
      socket.on('new_message', (msg) => {
        setMessages(prevMessages => [...prevMessages, msg]);
      });
      
      return () => {
        socket.off('new_message');
      };
    }
  }, [socket]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
		messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
	}
  }, [messages]);

const sendMessage = (e) => {
  e.preventDefault();
  if (message.trim() && socket?.connected && user?.id) {
    const filteredMessage = message.trim().replace(/fast/gi, '').trim();
    
    if (filteredMessage) {
      socket.emit('send_message', {
        gameId,
        userId: user.id,
        message: filteredMessage
      });
    } else {
      setMessages(prev => [...prev, {
        userId: user?.id,
        message: 'Message contained only filtered content',
        timestamp: new Date()
      }]);
    }
    setMessage('');
  } else {
    setMessages(prev => [...prev, {
      userId: user?.id,
      message: 'Cannot send message: Server disconnected',
      timestamp: new Date()
    }]);
  }
};
  // If user is not logged in, show login message
  if (!isLoggedIn) {
    return <div>Please log in to use chat.</div>;
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3>{isSpectator ? 'Spectator Chat' : 'Game Chat'}</h3>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <p className="no-messages">No messages yet. Start the conversation!</p>
        ) : (
          messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message ${msg.userId === user?.id ? 'own' : ''}`}
            >
              <span className="user">{msg.userId === user?.id ? 'You' : 'Opponent'}</span>: {msg.message}
              <span className="time">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input" onSubmit={sendMessage}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default Chat;