const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const Game = require('./models/Game');
const authController = require('./controllers/authController');
const gameController = require('./controllers/gameController');
const auth = require('./middleware/auth');

const { playerActivityMap } = require('./shared');

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

dotenv.config();
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const socketRateLimits = {
  'make_move': { windowMs: 1000, max: 3 }, // 3 moves per second
  'send_message': { windowMs: 5000, max: 5 }, // 5 messages per 5 seconds
  'join_game': { windowMs: 30000, max: 5 } // 5 joins per 30 seconds
};

const socketLimiters = {};

if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET is not set');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
}));
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const connectWithRetry = () => {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => logger.info('Connected to MongoDB'), console.log('Connected to MongoDB'))
    .catch(err => {
      logger.error('MongoDB connection error:', err);
      setTimeout(connectWithRetry, 5000);
    });
};
connectWithRetry();

// Add this to server.js after MongoDB connection
// In server.js
const cleanupAbandonedGames = async () => {
  try {
    console.log("\n--- RUNNING CLEANUP JOB ---");
    // Increase to 10 minutes during testing
    const cutoffTime = new Date(Date.now() - 10 * 60 * 1000);
    
    console.log(`Running cleanup job at ${new Date().toISOString()}, cutoff: ${cutoffTime.toISOString()}`);
    
    // Get all active games to see what we're working with
    const allActiveGames = await Game.find({ status: 'active' });
    console.log(`Total active games: ${allActiveGames.length}`);
    
    // Debug each game's updatedAt time
    for (const g of allActiveGames) {
      console.log(`Game ${g._id}: updatedAt = ${g.updatedAt}, diff = ${Date.now() - new Date(g.updatedAt).getTime()} ms`);
    }
    
    const abandonedGames = await Game.find({
      status: 'active',
      updatedAt: { $lt: cutoffTime }
    });
    
    console.log(`Found ${abandonedGames.length} potentially abandoned games`);
    
    for (const game of abandonedGames) {
      // IMPORTANT: Convert ObjectIds to strings properly
      const gameIdStr = game._id.toString();
      const whiteIdStr = game.whitePlayer ? game.whitePlayer.toString() : null;
      const blackIdStr = game.blackPlayer ? game.blackPlayer.toString() : null;
      
      console.log(`Checking game ${gameIdStr}, white: ${whiteIdStr}, black: ${blackIdStr}`);
      
      // Check the activity map for recent activity
      const whiteActivity = whiteIdStr ? playerActivityMap.get(`${gameIdStr}-${whiteIdStr}`) : null;
      const blackActivity = blackIdStr ? playerActivityMap.get(`${gameIdStr}-${blackIdStr}`) : null;
      
      console.log(`Activity data: white=${whiteActivity}, black=${blackActivity}`);
      
      // Don't abandon if there's recent activity
      if ((whiteActivity && Date.now() - whiteActivity < 10 * 60 * 1000) || 
          (blackActivity && Date.now() - blackActivity < 10 * 60 * 1000)) {
        console.log(`Game ${gameIdStr} has recent activity, not abandoning`);
        
        // Update timestamp and save
        game.updatedAt = new Date();
        await game.save();
        continue;
      }
      
      console.log(`About to abandon game ${gameIdStr}, last updated at ${game.updatedAt}`);
      game.status = 'abandoned';
      await game.save();
      logger.info(`Auto-abandoned game ${gameIdStr} due to inactivity`);
    }
    console.log("--- CLEANUP JOB COMPLETE ---\n");
  } catch (error) {
    logger.error('Error cleaning up abandoned games:', error);
  }
};

setTimeout(() => {
  // Run cleanup less frequently - every 5 minutes
  setInterval(cleanupAbandonedGames, 5 * 60 * 1000);
}, 5 * 60 * 1000); 

app.post('/api/register', authController.register);
app.post('/api/login', authController.login);
app.get('/api/games', auth, gameController.getGames);
app.post('/api/games', auth, gameController.createGame);
app.get('/api/games/:id', auth, gameController.getGame);

io.on('connection', (socket) => {
  logger.info('New client connected:', socket.id);
  
    socketLimiters[socket.id] = {};
  Object.keys(socketRateLimits).forEach(eventName => {
    const limit = socketRateLimits[eventName];
    socketLimiters[socket.id][eventName] = {
      windowStart: Date.now(),
      count: 0,
      windowMs: limit.windowMs,
      max: limit.max
    };
  });
  
  // Rate limiter middleware function
  const rateLimitEvent = (eventName, callback) => {
    const limiter = socketLimiters[socket.id][eventName];
    if (!limiter) return callback(); // No limit for this event
    
    const now = Date.now();
    // Reset window if expired
    if (now - limiter.windowStart > limiter.windowMs) {
      limiter.windowStart = now;
      limiter.count = 0;
    }
    
    // Check if limit exceeded
    if (limiter.count >= limiter.max) {
      socket.emit('error', `Too many ${eventName} requests. Please wait.`);
      return;
    }
    
    // Increment counter and proceed
    limiter.count++;
    callback();
  };
  
  socket.on('join_lobby', async () => {
    socket.join('lobby');
    const games = await Game.find({ status: 'waiting' }).populate('creator', 'username rating');
    socket.emit('lobby_games', games);
  });
  
  socket.on('create_game', async ({ userId, timeControl }) => {
    try {
      const res = {
        status: (code) => ({
          json: (data) => {
            socket.join(data._id.toString());
            socket.gameId = data._id.toString();
            io.to('lobby').emit('new_game_created', data);
          }
        })
	  };
      await gameController.createGame({ body: { userId, timeControl } }, res);
    } catch (error) {
      logger.error('Error creating game:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('heartbeat', ({ gameId, userId }) => {
    gameController.updatePlayerActivity(gameId, userId);
    const activityKey = `${gameId}-${userId}`;
    const lastActivity = playerActivityMap.get(activityKey) || 0;
  });
  
  socket.on('join_game', async (data) => {
	console.log(`Join request for game: ${data.gameId}, player: ${data.userId}`);
    rateLimitEvent('join_game', () => {
	  socket.gameId = data.gameId.toString();
	  socket.join(data.gameId);
      gameController.joinGame(data, socket, io);
    });
  });
  
    socket.on('make_move', async (data) => {
	  console.log("Received move request:", data);
    rateLimitEvent('make_move', () => {
	  data.gameId = data.gameId.toString();
      gameController.makeMove(data, socket, io);
    });
  });
  
  socket.on('spectate_game', ({ gameId }) => {
  gameController.spectateGame({ gameId }, socket);
});

  socket.on('rejoin_game', async ({ gameId, userId }) => {
  try {
    // Add socket to the game room
    socket.join(gameId);
    socket.gameId = gameId;
	
    gameController.handleReconnect(gameId);
    
	// Fetch current game state
    const game = await Game.findById(gameId);
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }
    
    // Send current game state to the client
    socket.emit('sync_game_state', {
      fen: game.fen,
      whiteTime: game.whiteTime,
      blackTime: game.blackTime,
      status: game.status,
      turn: game.turn
    });
    
    // Update player activity for this reconnected player
    gameController.updatePlayerActivity(gameId, userId);
    
    logger.info(`Player ${userId} rejoined game ${gameId}`);
  } catch (error) {
    logger.error('Error handling game rejoin:', error);
    socket.emit('error', 'Failed to rejoin the game');
  }
});
 
  socket.on('send_message', (data) => {
    rateLimitEvent('send_message', () => {
      io.to(data.gameId).emit('new_message', {
        userId: data.userId,
        message: data.message,
        timestamp: new Date()
      });
    });
  });
  
  socket.on('resign_game', ({ gameId, userId }) => {
    gameController.resignGame({ gameId, userId }, socket, io);
  });
  
  socket.on('offer_draw', ({ gameId, userId }) => {
    gameController.offerDraw({ gameId, userId }, socket, io);
  });
  
  socket.on('accept_draw', ({ gameId, userId }) => {
    gameController.acceptDraw({ gameId, userId }, socket, io);
  });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
	 delete socketLimiters[socket.id];
    if (socket.gameId) {
      gameController.handleDisconnect(socket.gameId, socket.id, io);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});