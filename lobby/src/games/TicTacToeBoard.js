import React from 'react';

const TicTacToeBoard = ({ G, ctx, moves, playerID }) => {
  const isMyTurn = playerID != null && String(playerID) === String(ctx.currentPlayer) && !ctx.gameover;
  const cells = G?.cells || [];

  const onClick = (id) => {
    if (!isMyTurn || cells[id] != null) return;
    moves.makeMove(id);
  };

  return (
    <div className="q-board is-ttt" role="grid" aria-label="井字棋棋盘">
      {cells.map((cell, index) => {
        const mark = cell === '0' || cell === 0 ? 'X' : cell === '1' || cell === 1 ? 'O' : '';
        return (
          <button
            key={index}
            type="button"
            className={`q-cell${mark === 'X' ? ' is-x' : mark === 'O' ? ' is-o' : ''}`}
            onClick={() => onClick(index)}
            disabled={!isMyTurn || mark !== '' || Boolean(ctx.gameover)}
            aria-label={`格子 ${index + 1}${mark ? ` ${mark}` : ''}`}
          >
            {mark}
          </button>
        );
      })}
    </div>
  );
};

export default TicTacToeBoard;
