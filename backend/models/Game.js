const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  updatedAt: {
    type: Date,
    default: Date.now
  },
  whitePlayer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  blackPlayer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timeControl: {
    type: Number,
    required: true
  },
  whiteTime: {
    type: Number
  },
  blackTime: {
    type: Number
  },
  fen: {
    type: String,
    default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  },
  status: {
    type: String,
    enum: ['waiting', 'active', 'checkmate', 'stalemate', 'draw', 'resigned', 'timeout', 'abandoned'],
    default: 'waiting'
  },
  turn: {
    type: String,
    enum: ['w', 'b'],
    default: 'w'
  },
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moves: [{
    from: String,
    to: String,
    promotion: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

gameSchema.index({ status: 1 });
gameSchema.index({ creator: 1 });

module.exports = mongoose.model('Game', gameSchema);