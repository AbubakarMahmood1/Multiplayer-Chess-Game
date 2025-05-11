const Game = require('../models/Game');
const User = require('../models/Users');
const chessLogic = require('../utils/chessLogic');
const winston = require('winston');
const mongoose = require('mongoose');

const timerIntervals = new Map();
const { playerActivityMap } = require('../shared');
const disconnectionTimers = new Map();

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

exports.updatePlayerActivity = async (gameId, userId) => {
  try {
    // Ensure both IDs are strings
    const gameIdStr = gameId.toString();
    const userIdStr = userId.toString();
    const activityKey = `${gameIdStr}-${userIdStr}`;
    
    const now = Date.now();
    
    // Store in activity map
    playerActivityMap.set(activityKey, now);
    
    // Get the game and update it directly
    const game = await Game.findById(gameId);
    if (game) {
      game.updatedAt = new Date();
      await game.save();
    } else {
      console.log(`Warning: Game ${gameId} not found when updating activity`);
    }
  } catch (error) {
    logger.error('Error updating player activity:', error);
  }
};

exports.getGames = async (req, res) => {
  try {
    const games = await Game.find({ status: 'waiting' }).populate('creator', 'username rating');
    res.json(games);
  } catch (error) {
    logger.error('Error fetching games:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

exports.createGame = async (req, res) => {
  try {
    const { userId, timeControl } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    if (!Number.isInteger(timeControl) || timeControl <= 0) {
      return res.status(400).json({ msg: 'Invalid time control' });
    }

    const game = new Game({
      whitePlayer: userId,
      creator: userId,
      timeControl,
      fen: chessLogic.getInitialFen(),
      status: 'waiting',
      turn: 'w'
    });

    await game.save();
    await game.populate('creator', 'username rating');
    res.status(201).json(game);
  } catch (error) {
    logger.error('Error creating game:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

exports.getGame = async (req, res) => {
  try {
    const game = await Game.findById(req.params.id)
      .populate('whitePlayer', 'username')
      .populate('blackPlayer', 'username')
      .populate('creator', 'username rating');
    if (!game) {
      return res.status(404).json({ msg: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    logger.error('Error fetching game:', error);
    res.status(500).json({ msg: 'Server error', error: error.message });
  }
};

exports.joinGame = async (req, socket, io) => {
	const session = await mongoose.startSession();
    session.startTransaction();
  try {
    const { gameId, userId } = req;
    const game = await Game.findById(gameId).session(session);
    if (!game) {
	  await session.abortTransaction();
      session.endSession();
      socket.emit('error', 'Game not found');
      return;
    }
    if (game.status !== 'waiting') {
      socket.emit('error', 'Game is not available');
      return;
    }
    if (game.whitePlayer.toString() === userId.toString()) {
      socket.emit('error', 'You cannot join your own game');
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      socket.emit('error', 'User not found');
      return;
    }
    if (!Number.isInteger(game.timeControl) || game.timeControl <= 0) {
      socket.emit('error', 'Invalid time control');
      return;
    }

    game.blackPlayer = userId;
    game.status = 'active';
    game.whiteTime = game.timeControl * 60;
    game.blackTime = game.timeControl * 60;
	game.updatedAt = new Date();
    await game.populate('whitePlayer blackPlayer creator', 'username rating');
    await game.save({ session });
	console.log(`Game ${gameId} joined by ${userId}, status set to active, updatedAt: ${game.updatedAt}`);
	
	await session.commitTransaction();
    session.endSession();
	socket.gameId = gameId.toString();
    socket.join(gameId);
    io.to(gameId).emit('game_started', game);
    io.to(gameId).emit('timer_update', {
      white: game.whiteTime,
      black: game.blackTime
    });
	
	const whiteIdStr = game.whitePlayer.toString();
	const blackIdStr = game.blackPlayer.toString();
	const gameIdStr = gameId.toString();

	playerActivityMap.set(`${gameIdStr}-${whiteIdStr}`, Date.now());
	playerActivityMap.set(`${gameIdStr}-${blackIdStr}`, Date.now());
	console.log(`Initial activity recorded for both players in game ${gameIdStr}`);

    setTimeout(() => {
      exports.startTimer(gameId, io);
    }, 5000);
  } catch (error) {
	await session.abortTransaction();
    session.endSession();
    logger.error('Error joining game:', error);
    socket.emit('error', 'Server error');
  }
};

exports.makeMove = async (req, socket, io) => {
  console.log("Move format check:", {
    moveType: typeof req.move,
    moveValue: req.move,
    gameId: req.gameId,
    userId: req.userId
  });
  
  let game = null;
  let retries = 3; // Allow up to 3 retries
  
  while (retries > 0) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { gameId, move, userId } = req;
      game = await Game.findById(gameId).session(session);
      
      if (!game) {
        await session.abortTransaction();
        session.endSession();
        socket.emit('move_rejected', { reason: 'Game not found', fen: null });
        return;
      }
      
      if (game.status !== 'active') {
        await session.abortTransaction();
        session.endSession();
        socket.emit('move_rejected', { reason: 'Game is not active', fen: game.fen });
        return;
      }
      
      const playerColor = game.whitePlayer.toString() === userId.toString() ? 'w' : 
                        game.blackPlayer.toString() === userId.toString() ? 'b' : null;
      if (!playerColor) {
        await session.abortTransaction();
        session.endSession();
        socket.emit('move_rejected', { reason: 'You are not a player in this game', fen: game.fen });
        return;
      }
      
      const parsedMove = typeof move === 'string' ? chessLogic.parseMoveString(move, game.fen) : { valid: true, move };
      if (!parsedMove.valid) {
        await session.abortTransaction();
        session.endSession();
        socket.emit('move_rejected', { reason: parsedMove.error || 'Invalid move format', fen: game.fen });
        return;
      }
      
      const moveResult = chessLogic.validateMove(game.fen, parsedMove.move, playerColor);
      if (!moveResult.valid) {
        await session.abortTransaction();
        session.endSession();
        console.error(`Move validation failed: ${moveResult.error}`, parsedMove.move);
        socket.emit('move_rejected', { reason: moveResult.error || 'Invalid move', fen: game.fen });
        return;
      }
      
      // Update game state
      game.fen = moveResult.fen;
      game.turn = moveResult.turn;
      game.moves.push(parsedMove.move);
      game.updatedAt = new Date();
      
      let gameEnded = false;
      
      // Check if game has ended
      if (moveResult.moveResult.status !== 'active') {
        gameEnded = true;
        game.status = moveResult.moveResult.status;
        game.winner = moveResult.moveResult.winner ? 
                    (moveResult.moveResult.winner === 'white' ? game.whitePlayer : game.blackPlayer) : null;
        
        // Clear interval since game has ended
        if (timerIntervals.has(gameId)) {
          clearInterval(timerIntervals.get(gameId));
          timerIntervals.delete(gameId);
        }
        
        if (game.winner) {
          await exports.updateRatings(game);
        }
      }
      
      await game.save({ session });
      
      await session.commitTransaction();
      session.endSession();
      
      // Emit move information
      io.to(gameId).emit('move_made', {
        fen: moveResult.fen,
        lastMove: moveResult.moveResult,
        turn: moveResult.turn
      });
      
      // Handle game end events
      if (gameEnded) {
        await game.populate('winner', 'username');
        io.to(gameId).emit('game_over', {
          status: moveResult.moveResult.status,
          winner: game.winner ? { _id: game.winner.toString(), username: game.winner.username } : null
        });
      }
      
      // If we made it here, the transaction was successful
      return;
      
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      // Check if this is a transaction error that can be retried
      if (error.message && error.message.includes('Write conflict during plan execution')) {
        console.log(`Transaction conflict detected, retrying... (${retries} attempts left)`);
        retries--;
        
        // Add a small random delay before retrying to reduce chance of another conflict
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
        
        // Continue to next iteration to retry
        continue;
      }
      
      // For other errors, log and report to client
      console.error('Detailed Move Error:', { 
        error: error.message, 
        stack: error.stack,
        gameId: req.gameId,
        move: req.move,
        userId: req.userId
      });
      
      logger.error('Error making move:', error);
      socket.emit('move_rejected', { reason: 'Server error: ' + error.message, fen: game ? game.fen : null });
      return;
    }
  }
  
  // If we've exhausted retries
  if (retries === 0) {
    socket.emit('move_rejected', { 
      reason: 'Transaction conflict after multiple retries. Please try again.',
      fen: game ? game.fen : null
    });
  }
};

exports.spectateGame = async (req, socket) => {
  try {
    const { gameId } = req;
    const game = await Game.findById(gameId)
      .populate('whitePlayer', 'username')
      .populate('blackPlayer', 'username')
      .populate('creator', 'username rating');
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }
    socket.join(gameId);
    socket.emit('game_state', game);
  } catch (error) {
    logger.error('Error spectating game:', error);
    socket.emit('error', 'Server error');
  }
};

exports.startTimer = async (gameId, io) => {
  try {
    // Clear any existing interval for this game
    if (timerIntervals.has(gameId)) {
      clearInterval(timerIntervals.get(gameId));
      timerIntervals.delete(gameId);
    }
    
    let game = await Game.findById(gameId);
    if (!game || game.status !== 'active') return;
    
    // Set a much longer grace period
    const initialActivityGracePeriod = 2 * 60 * 1000;
    const gameStartTime = Date.now();
    
    const inactivityPercentage = 0.15;
	const minimumInactivityTime = 60 * 1000;
    const activityCheckThreshold = Math.max(
		minimumInactivityTime,
		game.timeControl * 60 * 1000 * inactivityPercentage
	);
    
    console.log(`Starting timer for game ${gameId} with ${activityCheckThreshold/60000} minute inactivity threshold`);
    
    const interval = setInterval(async () => {
      try {
        // Refetch the game to get the latest state
        game = await Game.findById(gameId);
        
        // Check if game still exists and is active
        if (!game || game.status !== 'active') {
          clearInterval(interval);
          timerIntervals.delete(gameId);
          return;
        }
        
        // Update timers
        if (game.turn === 'w') {
          game.whiteTime -= 1;
        } else {
          game.blackTime -= 1;
        }
        
        // Only check for inactivity after initial grace period
        const elapsedSinceStart = Date.now() - gameStartTime;
        if (elapsedSinceStart > initialActivityGracePeriod) {
          const currentPlayerUserId = game.turn === 'w' ? game.whitePlayer.toString() : game.blackPlayer.toString();
          const activityKey = `${gameId}-${currentPlayerUserId}`;
          const lastActivity = playerActivityMap.get(activityKey) || 0;
          const timeSinceActivity = Date.now() - lastActivity;

          // Only abandon if we have a valid lastActivity timestamp (not 0) AND it exceeds the threshold
          if (lastActivity > 0 && timeSinceActivity > activityCheckThreshold) {
            console.log(`Abandoning game ${gameId} due to inactivity from player ${currentPlayerUserId}`);
            console.log(`Last activity timestamp: ${new Date(lastActivity).toISOString()}`);
            console.log(`Current time: ${new Date().toISOString()}`);
            console.log(`Time difference: ${timeSinceActivity/1000} seconds`);
            
            game.status = 'abandoned';
            clearInterval(interval);
            timerIntervals.delete(gameId);
            await game.save();
  
            io.to(gameId).emit('game_over', {
              status: 'abandoned',
              message: 'Game abandoned due to player inactivity'
            });
            return; // Exit the interval callback
          }
          
          // Send inactivity warning when approaching the limit
          if (lastActivity > 0 && timeSinceActivity > (activityCheckThreshold * 0.7)) {
            io.to(gameId).emit('inactivity_warning', {
              player: currentPlayerUserId,
              remainingSeconds: Math.floor((activityCheckThreshold - timeSinceActivity) / 1000)
            });
          }
        }
        
        // Check for timeout conditions
        if (game.whiteTime <= 0) {
          game.status = 'timeout';
          game.winner = game.blackPlayer;
          clearInterval(interval);
          timerIntervals.delete(gameId);
          await game.save();
          await exports.updateRatings(game);
        } else if (game.blackTime <= 0) {
          game.status = 'timeout';
          game.winner = game.whitePlayer;
          clearInterval(interval);
          timerIntervals.delete(gameId);
          await game.save();
          await exports.updateRatings(game);
        } else {
          await game.save();
        }
        
        // Emit timer update
        io.to(gameId).emit('timer_update', {
          white: game.whiteTime,
          black: game.blackTime
        });
        
        // Handle game over events
        if (game.status !== 'active') {
          await game.populate('winner', 'username');
          io.to(gameId).emit('game_over', {
            status: game.status,
            winner: game.winner ? { _id: game.winner.toString(), username: game.winner.username } : null
          });
        }
      } catch (error) {
        logger.error(`Error in timer interval for game ${gameId}:`, error);
        clearInterval(interval);
        timerIntervals.delete(gameId);
      }
    }, 1000);
    
    // Store the interval
    timerIntervals.set(gameId, interval);
  } catch (error) {
    logger.error('Error starting timer:', error);
  }
};

exports.resignGame = async (req, socket, io) => {
  try {
    const { gameId, userId } = req;
    const game = await Game.findById(gameId);
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }
    if (game.status !== 'active') {
      socket.emit('error', 'Game is not active');
      return;
    }
    if (game.whitePlayer.toString() !== userId.toString() && game.blackPlayer.toString() !== userId.toString()) {
      socket.emit('error', 'You are not a player in this game');
      return;
    }
    
    // Update game status
    game.status = 'resigned';
    game.winner = game.whitePlayer.toString() === userId.toString() ? game.blackPlayer : game.whitePlayer;
    
    // Clear timer interval
    if (timerIntervals.has(gameId)) {
      clearInterval(timerIntervals.get(gameId));
      timerIntervals.delete(gameId);
    }
    
    await game.save();
    await exports.updateRatings(game);
    
    await game.populate('winner', 'username');
    io.to(gameId).emit('game_over', {
      status: 'resigned',
      winner: game.winner ? { _id: game.winner.toString(), username: game.winner.username } : null
    });
  } catch (error) {
    logger.error('Error resigning game:', error);
    socket.emit('error', 'Server error');
  }
};

exports.offerDraw = async (req, socket, io) => {
  try {
    const { gameId, userId } = req;
    const game = await Game.findById(gameId);
    if (!game || game.status !== 'active') {
      socket.emit('error', 'Game is not active');
      return;
    }
    if (game.whitePlayer.toString() !== userId.toString() && game.blackPlayer.toString() !== userId.toString()) {
      socket.emit('error', 'You are not a player in this game');
      return;
    }
    io.to(gameId).emit('draw_offered', { userId });
  } catch (error) {
    logger.error('Error offering draw:', error);
    socket.emit('error', 'Server error');
  }
};

exports.acceptDraw = async (req, socket, io) => {
  try {
    const { gameId, userId } = req;
    const game = await Game.findById(gameId);
    if (!game || game.status !== 'active') {
      socket.emit('error', 'Game is not active');
      return;
    }
    if (game.whitePlayer.toString() !== userId.toString() && game.blackPlayer.toString() !== userId.toString()) {
      socket.emit('error', 'You are not a player in this game');
      return;
    }
    
    // Update game status
    game.status = 'draw';
    
    // Clear timer interval
    if (timerIntervals.has(gameId)) {
      clearInterval(timerIntervals.get(gameId));
      timerIntervals.delete(gameId);
    }
    
    await game.save();
    
    io.to(gameId).emit('game_over', {
      status: 'draw',
      winner: null
    });
  } catch (error) {
    logger.error('Error accepting draw:', error);
    socket.emit('error', 'Server error');
  }
};

exports.calculateEloChange = (playerRating, opponentRating, result) => {
  const k = 32;
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  return Math.round(k * (result - expected));
};

exports.updateRatings = async (game) => {
  try {
    if (!game.winner) return;
    const winner = await User.findById(game.winner);
    const loser = game.winner.toString() === game.whitePlayer.toString()
      ? await User.findById(game.blackPlayer)
      : await User.findById(game.whitePlayer);
    if (!winner || !loser) return;
    const winnerChange = exports.calculateEloChange(winner.rating, loser.rating, 1);
    const loserChange = exports.calculateEloChange(loser.rating, winner.rating, 0);
    winner.rating += winnerChange;
    loser.rating += loserChange;
    await winner.save();
    await loser.save();
  } catch (error) {
    logger.error('Error updating ratings:', error);
  }
};

exports.handleDisconnect = async (gameId, socketId, io) => {
  try {
    console.log(`Client ${socketId} disconnected from game ${gameId}`);
    
    // Check if the game exists and is active
    const game = await Game.findById(gameId);
    if (!game || game.status !== 'active') {
      // Game already ended or doesn't exist, nothing to do
      return;
    }
    
    // Log the disconnection event
    logger.info(`Client ${socketId} disconnected from game ${gameId}, setting reconnection timer`);
    
    // Clear any existing disconnect timer for this game
    if (disconnectionTimers.has(gameId)) {
      clearTimeout(disconnectionTimers.get(gameId));
    }
    
    // Set a timer to abandon the game if no reconnection happens
    const disconnectTimer = setTimeout(async () => {
      try {
        // Re-fetch the game to get the latest state
        const currentGame = await Game.findById(gameId);
        if (!currentGame || currentGame.status !== 'active') {
          return; // Game already ended or doesn't exist
        }
        
        console.log(`Reconnection grace period expired for game ${gameId}, marking as abandoned`);
        
        // Update game status to abandoned
        currentGame.status = 'abandoned';
        
        // Clear timer interval
        if (timerIntervals.has(gameId)) {
          clearInterval(timerIntervals.get(gameId));
          timerIntervals.delete(gameId);
        }
        
        // Save the updated game state
        await currentGame.save();
        
        // Notify clients
        io.to(gameId).emit('game_over', {
          status: 'abandoned',
          message: 'Game abandoned due to disconnection',
          winner: null
        });
        
        // Clean up the disconnection timer
        disconnectionTimers.delete(gameId);
        
      } catch (error) {
        logger.error(`Error abandoning game ${gameId} after disconnect timeout:`, error);
      }
    }, 5 * 60 * 1000);
    
    // Store the timer
    disconnectionTimers.set(gameId, disconnectTimer);
    
  } catch (error) {
    logger.error('Error handling disconnect:', error);
  }
};

exports.handleReconnect = (gameId) => {
  // If there's a pending disconnection timer for this game, clear it
  if (disconnectionTimers.has(gameId)) {
    console.log(`Player reconnected to game ${gameId}, cancelling abandonment timer`);
    clearTimeout(disconnectionTimers.get(gameId));
    disconnectionTimers.delete(gameId);
  }
};