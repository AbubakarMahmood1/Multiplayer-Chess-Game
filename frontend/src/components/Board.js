import React, { useState, useEffect } from 'react';
import { Chess } from '../utils/chess.js';
import '../styles/Board.css';

function Board({ fen, onMove, isSpectator, playerColor, lastMove }) {
  const [chess, setChess] = useState(new Chess(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);
  const [imageErrors, setImageErrors] = useState({});
  const [pendingMove, setPendingMove] = useState(null);
  const [moveInProgress, setMoveInProgress] = useState(false);
  const [gameStatus, setGameStatus] = useState('active');

  const pieceSymbols = {
    wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
    bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚'
  };

  useEffect(() => {
    if (fen) {
      try {
        const newChess = new Chess(fen);
        setChess(newChess);
		if (newChess.isCheckmate()) {
        setGameStatus('checkmate');
      } else if (newChess.isDraw()) {
        setGameStatus('draw');
      } else if (newChess.isStalemate()) {
        setGameStatus('stalemate');
      } else {
        setGameStatus('active');
      }
      } catch (error) {
        console.error('Invalid FEN:', error);
      }
    }
  }, [fen]);

  const getMoves = (square) => {
    try {
      const moves = chess.moves({ square, verbose: true });
      return moves.map(move => move.to);
    } catch (error) {
      return [];
    }
  };

  const handleSquareClick = (square) => {
  console.log(`Square clicked: ${square}`);
  console.log(`Selected: ${selectedSquare}, Possible moves:`, possibleMoves);
  console.log(`Is spectator: ${isSpectator}, Player color: ${playerColor}, Turn: ${chess.turn()}`);
  
  if (moveInProgress || gameStatus !== 'active') return;
  if (isSpectator) return;
  
  const turn = chess.turn();
  if ((turn === 'w' && playerColor !== 'white') || (turn === 'b' && playerColor !== 'black')) {
    return;
  }
  
  if (selectedSquare === square) {
    // Deselect the square if it's clicked again
    setSelectedSquare(null);
    setPossibleMoves([]);
  } else if (selectedSquare) {
    // Try to move to the selected square
    if (possibleMoves.includes(square)) {
      const piece = chess.get(selectedSquare);
      const move = {
        from: selectedSquare,
        to: square
      };
      
      // Handle pawn promotion
      if (piece && piece.type === 'p') {
        const isPromotion = (piece.color === 'w' && square[1] === '8') || 
                           (piece.color === 'b' && square[1] === '1');
        if (isPromotion) {
          move.promotion = 'q'; // Always promote to queen for simplicity
        }
      }
	  
	  setMoveInProgress(true);
      setPendingMove(move);
      
      try {
        const tempChess = new Chess(chess.fen());
        const moveResult = tempChess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion
        });
        
        if (!moveResult) {
          throw new Error('Invalid move');
        }
        
        // Send move to server
        onMove(move);
        
        // Set timeout to reset if server doesn't respond
        setTimeout(() => {
          setMoveInProgress(false);
          setPendingMove(null);
        }, 5000); // 5 second timeout
      } catch (error) {
        console.error('Invalid move:', error);
        setMoveInProgress(false);
        setPendingMove(null);
      }
	  
      setSelectedSquare(null);
      setPossibleMoves([]);
    } else {
      // If clicking on a different piece of the same color, select that piece
      const piece = chess.get(square);
      if (piece && ((piece.color === 'w' && playerColor === 'white') || 
                   (piece.color === 'b' && playerColor === 'black'))) {
        setSelectedSquare(square);
        setPossibleMoves(getMoves(square));
      } else {
        // If clicking on an empty square or opponent's piece, deselect
        setSelectedSquare(null);
        setPossibleMoves([]);
      }
    }
  } else {
    // First click on a piece
    const piece = chess.get(square);
    if (piece && ((piece.color === 'w' && playerColor === 'white') || 
                 (piece.color === 'b' && playerColor === 'black'))) {
      setSelectedSquare(square);
      setPossibleMoves(getMoves(square));
    }
  }
  };

  const handleImageError = (pieceKey) => {
    console.error(`Failed to load piece image: ${pieceKey}`);
    setImageErrors(prev => ({ ...prev, [pieceKey]: true }));
  };

  const renderSquares = () => {
    const squares = [];
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const effectivePlayerColor = playerColor || (isSpectator ? 'white' : 'white');
    const orderedFiles = effectivePlayerColor === 'black' ? [...files].reverse() : files;
    const orderedRanks = effectivePlayerColor === 'black' ? [...ranks].reverse() : ranks;

    for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
        const file = orderedFiles[fileIndex];
        const rank = orderedRanks[rankIndex];
        const square = file + rank;
        const piece = chess.get(square);
        const isLight = (fileIndex + rankIndex) % 2 === 0;
        const isSelected = selectedSquare === square;
        const isHighlighted = possibleMoves.includes(square);
        const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);
        const isDisabled = isSpectator || 
                          (chess.turn() === 'w' && playerColor !== 'white') || 
                          (chess.turn() === 'b' && playerColor !== 'black');
		const isPendingMoveSquare = pendingMove && 
          (pendingMove.from === square || pendingMove.to === square);

        squares.push(
          <div 
            key={square}
            className={`square ${isLight ? 'square-light' : 'square-dark'} 
                      ${isDisabled ? 'disabled' : ''}
                      ${isPendingMoveSquare ? 'pending-move' : ''}`}
            onClick={() => handleSquareClick(square)}
            tabIndex={isDisabled ? -1 : 0}
            role="gridcell"
            aria-label={`Square ${square}${piece ? ` containing ${piece.color} ${piece.type}` : ''}`}
          >
            {piece && (
              <div className="piece">
                {imageErrors[`${piece.color}${piece.type}`] ? (
                  <span className="piece-symbol">
                    {pieceSymbols[`${piece.color}${piece.type}`]}
                  </span>
                ) : (
                  <img
                    src={`/assets/${piece.color}${piece.type}.png`}
                    alt={`${piece.color}${piece.type}`}
                    className="piece-image"
                    onError={() => handleImageError(`${piece.color}${piece.type}`)}
                  />
                )}
				{isPendingMoveSquare && <div className="pending-move-indicator" />}
              </div>
			   
            )}
            {isSelected && <div className="highlight" />}
            {isHighlighted && <div className="possible-move" />}
            {isLastMoveSquare && <div className="last-move" />}
          </div>
        );
      }
    }
    return squares;
  };
  
  useEffect(() => {
    if (pendingMove && fen) {
      // If we get a new FEN, the move was processed
      setMoveInProgress(false);
      setPendingMove(null);
    }
  }, [fen, pendingMove]);

  return (
    <div className="chessboard">
      {renderSquares()}
    </div>
  );
}

export default Board;