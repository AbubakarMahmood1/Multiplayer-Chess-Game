const { Chess } = require('chess.js');
const winston = require('winston');

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

exports.validateMove = (fen, move, playerColor) => {
  try {
	console.log(`Validating move: ${JSON.stringify(move)} with FEN: ${fen.substring(0, 20)}... for player: ${playerColor}`);
    const chess = new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const currentTurn = chess.turn();
    if (currentTurn !== playerColor) {
      return {
        valid: false,
        fen: fen,
        turn: currentTurn,
        error: `Not your turn. Current turn: ${currentTurn === 'w' ? 'white' : 'black'}`,
        moveResult: null
      };
    }
    const moveResult = chess.move(move);
    if (!moveResult) {
      return {
        valid: false,
        fen: fen,
        turn: currentTurn,
        error: 'Invalid move',
        moveResult: null
      };
    }
    const newFen = chess.fen();
    const newTurn = chess.turn();
    const gameOver = chess.isGameOver();
    let status = 'active';
    let winner = null;
    if (gameOver) {
      if (chess.isCheckmate()) {
        status = 'checkmate';
        winner = currentTurn === 'w' ? 'white' : 'black';
      } else if (chess.isStalemate()) {
        status = 'stalemate';
      } else if (chess.isDraw()) {
        status = 'draw';
      } else if (chess.isThreefoldRepetition()) {
        status = 'draw';
      } else if (chess.isInsufficientMaterial()) {
        status = 'draw';
      }
    }
    return {
      valid: true,
      fen: newFen,
      turn: newTurn,
      error: null,
      moveResult: { ...moveResult, status, winner }
    };
  } catch (error) {
	  console.error('Detailed validation error:', {
      fen: fen, 
      move: move,
      playerColor: playerColor,
      error: error.message,
      stack: error.stack
    });
    logger.error('FEN validation error:', { fen, error: error.message });
    return {
      valid: false,
      fen: fen,
      turn: null,
      error: `Invalid FEN: ${error.message}`,
      moveResult: null
    };
  }
};

exports.getLegalMoves = (fen, square) => {
  try {
    const chess = new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const moves = chess.moves({ square, verbose: true });
    return {
      moves: moves.map(move => move.to),
      error: null
    };
  } catch (error) {
    logger.error('Error getting legal moves:', { fen, square, error: error.message });
    return {
      moves: [],
      error: `Error getting legal moves: ${error.message}`
    };
  }
};

exports.getGameStatus = (fen) => {
  try {
    const chess = new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    return {
      inCheck: chess.inCheck(),
      isCheckmate: chess.isCheckmate(),
      isStalemate: chess.isStalemate(),
      isDraw: chess.isDraw() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial(),
      turn: chess.turn(),
      error: null
    };
  } catch (error) {
    logger.error('Error getting game status:', { fen, error: error.message });
    return {
      inCheck: false,
      isCheckmate: false,
      isStalemate: false,
      isDraw: false,
      turn: null,
      error: `Error getting game status: ${error.message}`
    };
  }
};

exports.getInitialFen = () => {
  return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
};

exports.parseMoveString = (moveString, fen) => {
  try {
	  console.log(`Parsing move string: ${moveString} with FEN: ${fen ? fen.substring(0, 20) + '...' : 'undefined'}`);
    if (typeof moveString !== 'string' || moveString.length < 4) {
      return { valid: false, move: null, error: 'Invalid move string format' };
    }
    const from = moveString.slice(0, 2);
    const to = moveString.slice(2, 4);
    const promotion = moveString.length > 4 ? moveString.slice(4, 5).toLowerCase() : undefined;
    if (promotion && !['q', 'r', 'b', 'n'].includes(promotion)) {
      return { valid: false, move: null, error: 'Invalid promotion piece' };
    }
    const chess = new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const move = { from, to };
    if (promotion) {
      move.promotion = promotion;
    }
    const moveResult = chess.move(move);
    if (!moveResult) {
      return { valid: false, move: null, error: 'Invalid move' };
    }
    return { valid: true, move, error: null };
  } catch (error) {
    logger.error('Move parsing error:', { moveString, fen, error: error.message });
    return { valid: false, move: null, error: `Error parsing move: ${error.message}` };
  }
};