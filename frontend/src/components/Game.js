import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { initSocket, disconnectSocket, setActiveGame, clearActiveGame } from '../utils/socket';
import Board from './Board';
import Timer from './Timer';
import Chat from './Chat';
import '../styles/Game.css';

function Game() {
  const { id: gameId } = useParams();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = user?.id || '';
  
  // Game state
  const [game, setGame] = useState(null);
  const [socket, setSocket] = useState(null);
  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [playerColor, setPlayerColor] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [gameOver, setGameOver] = useState(false);
  const [gameResult, setGameResult] = useState('');
  const [error, setError] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [drawOffered, setDrawOffered] = useState(false);
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const [pendingMove, setPendingMove] = useState(null);
  const [moveInProgress, setMoveInProgress] = useState(false);

  // Initialize socket and fetch game data
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    if (!token || !userId) {
      navigate('/login');
      return;
    }
    
    setActiveGame(gameId, userId);
    
    // Initialize socket connection
    const newSocket = initSocket();
    
    // Socket event handlers
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
    
    newSocket.on('sync_game_state', (gameState) => {
      console.log('Received game state sync after reconnection:', gameState);
      if (gameState.fen) setFen(gameState.fen);
      if (gameState.whiteTime) setWhiteTime(gameState.whiteTime);
      if (gameState.blackTime) setBlackTime(gameState.blackTime);
      if (gameState.status !== 'active') {
        setGameOver(true);
        setGameResult(gameState.status);
      }
    });
	
	newSocket.on('inactivity_warning', (data) => {
	if (data.player === userId) {
		setError(`Warning: You will be disconnected due to inactivity in ${data.remainingSeconds} seconds. Make a move to stay active.`);
	} else {
		setError(`Warning: Your opponent will be disconnected due to inactivity in ${data.remainingSeconds} seconds.`);
	}
	});
	
	newSocket.on('move_rejected', (data) => {
		console.log('Move rejected:', data);
    
    // Reset the board to server state if provided
    if (data.fen) {
      setFen(data.fen);
    }
    
    // Show error message to user
    setError(data.reason || 'Move rejected');
    
    // Clear pending move state
    setPendingMove(null);
    setMoveInProgress(false);
	});
    
    setSocket(newSocket);
    
    // Fetch game data
    const fetchGame = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/games/${gameId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch game');
        }
        
        const gameData = await response.json();
        setGame(gameData);
        
        // Set game state from data
        if (gameData.fen) {
          setFen(gameData.fen);
        }
        
        setWhiteTime(gameData.whiteTime || gameData.timeControl * 60);
        setBlackTime(gameData.blackTime || gameData.timeControl * 60);
        
        // Determine player color
        if (gameData.whitePlayer && gameData.whitePlayer._id === userId) {
			console.log("Setting player as white");
            setPlayerColor('white');
		} else if (gameData.blackPlayer && gameData.blackPlayer._id === userId) {
          console.log("Setting player as black");
		  setPlayerColor('black');
        } else {
		  console.log("Setting as spectator");
          setIsSpectator(true);
          newSocket.emit('spectate_game', { gameId, userId });
        }
        
        // Check if game is already over
        if (gameData.status !== 'active' && gameData.status !== 'waiting') {
          setGameOver(true);
          setGameResult(gameData.status);
        }
      } catch (error) {
        console.error('Error fetching game:', error);
        setError('Failed to load game');
      }
    };
    
    fetchGame();
    
    // Set up socket event listeners
	newSocket.on('move_made', (data) => {
		console.log("Move received from server:", data);
		setFen(data.fen);
		setLastMove(data.lastMove);
	if (data.lastMove && data.lastMove.san) {
		setMoveHistory(prev => [...prev, data.lastMove]);
	} else {
		console.warn("Received move without san notation:", data.lastMove);
	}
	});
    
    newSocket.on('timer_update', (data) => {
      if (data.white !== undefined) {
        setWhiteTime(data.white);
      }
      if (data.black !== undefined) {
        setBlackTime(data.black);
      }
    });
    
    newSocket.on('game_over', (data) => {
      setGameOver(true);
      setGameResult(data.status);
    });
    
    newSocket.on('draw_offered', ({ userId: offererId }) => {
      if (userId !== offererId) {
        setDrawOffered(true);
      }
    });
    
    // Clean up function
    return () => {
      newSocket.off('move_made');
      newSocket.off('timer_update');
      newSocket.off('game_over');
      newSocket.off('draw_offered');
      newSocket.off('error');
      newSocket.off('connect_error');
      newSocket.off('new_message');
      newSocket.off('sync_game_state');
	  newSocket.off('move_rejected');
      clearActiveGame();
      disconnectSocket();
    };
  }, [gameId, navigate, userId]);
  
  // Send initial heartbeat after socket is established
  useEffect(() => {
    if (socket && userId && gameId) {
      console.log("Sending initial heartbeat after socket is set");
      socket.emit('heartbeat', { gameId, userId });
    }
  }, [socket, userId, gameId]);
  
  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);
  
  // Regular heartbeat interval
  useEffect(() => {
    if (socket && userId && !isSpectator && !gameOver) {
      // Send heartbeat every 5 seconds
      const heartbeatInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('heartbeat', { gameId, userId });
          console.log("Heartbeat sent for game:", gameId);
        }
      }, 5000);
    
      return () => clearInterval(heartbeatInterval);
    }
  }, [socket, gameId, userId, isSpectator, gameOver]);
  
  const handleUserActivity = useCallback(() => {
  if (socket?.connected && !isSpectator && !gameOver) {
    socket.emit('heartbeat', { gameId, userId });
    console.log("Activity registered in game:", gameId);
  }
  }, [socket, gameId, userId, isSpectator, gameOver]);
  
  useEffect(() => {
  if (!isSpectator && !gameOver) {
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('mousemove', handleUserActivity);
    
    return () => {
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('mousemove', handleUserActivity);
    };
  }
  }, [isSpectator, gameOver, handleUserActivity]);
  
  // Handle player moves with rate limiting
  const handleMove = (move) => {  
  if (socket?.connected && !isSpectator && !gameOver && !moveInProgress) {
    const now = Date.now();
    if (now - lastMoveTime < 200) return;
    setLastMoveTime(now);
    
    console.log(`Attempting move: ${move.from} to ${move.to}`);
    console.log(`Player color: ${playerColor}, Game status: ${game.status}`);
    
    // Set pending move state
    setPendingMove(move);
    setMoveInProgress(true);
    
    // Send move to server
    socket.emit('make_move', {
      gameId,
      move: `${move.from}${move.to}${move.promotion || ''}`,
      userId
    });
    
    // Set timeout to reset UI if server doesn't respond
    setTimeout(() => {
      if (pendingMove) {
        console.log('Move timed out - resetting UI');
        setPendingMove(null);
        setMoveInProgress(false);
        setError('Move timed out. Please try again.');
      }
    }, 5000);
    
    handleUserActivity();
  } else {
    console.log("Move blocked:", {
      socketConnected: socket?.connected,
      isSpectator,
      gameOver,
      moveInProgress
    });
    
    if (moveInProgress) {
      setError('Please wait, move in progress');
    }
  }
};

  useEffect(() => {
  if (lastMove && pendingMove) {
    // Check if this lastMove matches our pendingMove
    if (lastMove.from === pendingMove.from && lastMove.to === pendingMove.to) {
      setPendingMove(null);
      setMoveInProgress(false);
    }
  }
}, [lastMove, pendingMove]);
 
  // Game action handlers
  const handleResign = () => {
    if (socket?.connected && !isSpectator && !gameOver) {
      socket.emit('resign_game', { gameId, userId });
    } else {
      setError('Cannot resign: Disconnected or not a player');
    }
  };
  
  const offerDraw = () => {
    if (socket?.connected && !isSpectator && !gameOver) {
      socket.emit('offer_draw', { gameId, userId });
    }
  };
  
  const acceptDraw = () => {
    if (socket?.connected && !isSpectator && !gameOver) {
      socket.emit('accept_draw', { gameId, userId });
      setDrawOffered(false);
    }
  };
  
  // Loading state
  if (!game) {
    return <div className="loading">Loading game...</div>;
  }
  
  // Game result message helper
  const getGameResultMessage = () => {
    switch(gameResult) {
      case 'checkmate':
        return `Checkmate! ${game.winner ? game.winner.username : ''} wins!`;
      case 'stalemate':
        return 'Game ended in stalemate!';
      case 'draw':
        return 'Game ended in draw!';
      case 'resigned':
        return `${game.winner ? game.winner.username : ''} wins by resignation!`;
      case 'timeout':
        return `${game.winner ? game.winner.username : ''} wins on time!`;
      case 'abandoned':
        return 'Game abandoned!';
      default:
        return 'Game over!';
    }
  };
  
  return (
    <div className="game-container">
      <div className="game-header">
        <h2>Chess Game</h2>
        <button className="btn" onClick={() => navigate('/lobby')}>Back to Lobby</button>
      </div>
      
      {error && (
        <div className="error-message" onClick={() => setError(null)}>
          <span role="img" aria-label="Warning">⚠️</span>
          {error}
          <span className="dismiss-error">×</span>
        </div>
      )}
      
      <div className="game-content">
        <div className="game-board-container">
          <div className="player-info top">
            <div className="player-name">
              {game.blackPlayer ? game.blackPlayer.username : 'Waiting for opponent'}
            </div>
            <Timer time={blackTime} color="black" />
          </div>
          
          <Board 
            fen={fen} 
            onMove={handleMove} 
            isSpectator={isSpectator} 
            playerColor={playerColor} 
            lastMove={lastMove} 
			pendingMove={pendingMove}
			/>
          
          <div className="player-info bottom">
            <div className="player-name">
              {game.whitePlayer ? game.whitePlayer.username : 'Unknown'}
            </div>
            <Timer time={whiteTime} color="white" />
          </div>
          
          <div className="game-controls">
            {!isSpectator && !gameOver && (
              <>
                <button className="btn btn-danger" onClick={handleResign}>Resign</button>
                <button className="btn btn-secondary" onClick={offerDraw}>Offer Draw</button>
                {drawOffered && (
                  <button className="btn btn-success" onClick={acceptDraw}>Accept Draw</button>
                )}
              </>
            )}
          </div>
      
          {gameOver && (
            <div className="game-over-overlay">
              <div className="game-over-message">
                <h3>Game Over</h3>
                <p>{getGameResultMessage()}</p>
                <button className="btn" onClick={() => navigate('/lobby')}>Back to Lobby</button>
              </div>
            </div>
          )}
        </div>
        
        <div className="move-history">
          <h3>Move History</h3>
          <ul>
            {moveHistory.map((move, index) => (
              <li key={index}>{`${Math.floor(index / 2) + 1}. ${move.san}`}</li>
            ))}
          </ul>
        </div>
        
        <Chat socket={socket} gameId={gameId} isSpectator={isSpectator} />
      </div>
    </div>
  );
}

export default Game;