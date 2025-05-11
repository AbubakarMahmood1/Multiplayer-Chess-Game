import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {initSocket, disconnectSocket } from '../utils/socket';
import '../styles/Lobby.css';

function Lobby() {
  const [currentUser, setCurrentUser] = useState(null);
  const [games, setGames] = useState([]);
  const [timeControl, setTimeControl] = useState(10);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
	
	const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setCurrentUser(userData);
    
    const newSocket = initSocket();
    newSocket.on('connect', () => {
      console.log('Socket connected');
    });
    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setError('Connection to server lost');
    });
    newSocket.on('error', (message) => {
      console.error('Server error:', message);
      setError(message);
    });
    setSocket(newSocket);
    
    newSocket.emit('join_lobby');
    
    newSocket.on('lobby_games', (gamesList) => {
      console.log('Received games:', gamesList);
      setGames(gamesList);
      setLoading(false);
    });
    
    newSocket.on('new_game_created', (newGame) => {
      setGames(prevGames => [...prevGames, newGame]);
    });
    
    newSocket.on('game_started', (game) => {
      console.log('Game started:', game);
      navigate(`/game/${game._id}`);
    });
    
    return () => {
      newSocket.off('lobby_games');
      newSocket.off('new_game_created');
      newSocket.off('game_started');
      disconnectSocket();
    };
  }, [navigate]);
  
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  const createGame = () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user && socket?.connected) {
      socket.emit('create_game', { userId: user.id, timeControl: Number(timeControl) });
    } else {
      setError('Please log in to create a game');
    }
  };
  
  const joinGame = (gameId) => {
    console.log('Join game clicked for game ID:', gameId);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.id) {
      setError('Please log in again');
      return;
    }
    if (!socket?.connected) {
      setError('Connection to server lost');
      return;
    }
    socket.emit('join_game', { gameId, userId: user.id });
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>Game Lobby</h2>
        <div>
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </div>
	  
	  {currentUser && (
		<div className="user-welcome">
			Hi, <span className="username">{currentUser.username}</span>!
		</div>
	  )}
      
      {error && (
        <div className="error-message" onClick={() => setError(null)}>
          <span role="img" aria-label="Warning">⚠️</span>
        {error}
      <span className="dismiss-error">×</span>
        </div>
      )}
      
      <div className="create-game">
        <h3>Create New Game</h3>
        <div className="time-control">
          <label>Time Control: </label>
          <select value={timeControl} onChange={(e) => setTimeControl(e.target.value)}>
            <option value="1">1 minute</option>
            <option value="3">3 minutes</option>
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
          </select>
        </div>
        <button className="btn" onClick={createGame}>Create Game</button>
      </div>
      
      <div className="available-games">
        <h3>Available Games</h3>
        {games.length === 0 ? (
          <p>No games available. Create one to start playing!</p>
        ) : (
          <ul className="game-list">
            {games.map(game => (
              <li key={game._id} className="game-item">
                <div>
                  <span className="creator-name">{game.creator.username}</span>
                  <span className="creator-rating">({game.creator.rating || 1500})</span>
                  <span className="time-info">{game.timeControl} min</span>
                </div>
                <button className="btn btn-secondary" onClick={() => joinGame(game._id)}>
                  Join Game
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Lobby;