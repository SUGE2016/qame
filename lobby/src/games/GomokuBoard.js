import React from 'react';

const BOARD_SIZE = 9;

const GomokuBoard = ({ G, ctx, moves, playerID }) => {
  const isMyTurn = playerID != null && String(playerID) === String(ctx.currentPlayer) && !ctx.gameover;
  const cells = G?.cells || [];

  const onClick = (position) => {
    if (!isMyTurn || cells[position] != null) return;
    moves.makeMove(position);
  };

  return (
    <div className="q-board is-gomoku" role="grid" aria-label="五子棋棋盘">
      {cells.map((cell, index) => {
        const mark = cell === '0' || cell === 0 ? '●' : cell === '1' || cell === 1 ? '○' : '';
        const row = Math.floor(index / BOARD_SIZE) + 1;
        const col = (index % BOARD_SIZE) + 1;
        return (
          <button
            key={index}
            type="button"
            className={`q-cell${mark === '●' ? ' is-x' : mark === '○' ? ' is-o' : ''}${G.lastMove === index ? ' is-last' : ''}`}
            onClick={() => onClick(index)}
            disabled={!isMyTurn || mark !== '' || Boolean(ctx.gameover)}
            aria-label={`第${row}行第${col}列${mark ? ` ${mark}` : ''}`}
          >
            {mark}
          </button>
        );
      })}
    </div>
  );
};

export default GomokuBoard;
