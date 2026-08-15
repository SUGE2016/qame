import React from 'react';

const SIZE = 10;

function shipSet(ships) {
  const set = new Set();
  for (const ship of ships || []) {
    for (const cell of ship) set.add(Number(cell));
  }
  return set;
}

function Grid({ label, ships, shots, clickable, onFire, disabled }) {
  const fleet = shipSet(ships);
  return (
    <div>
      <div className="q-navy-label">{label}</div>
      <div className="q-board is-navy" role="grid" aria-label={label}>
        {Array.from({ length: SIZE * SIZE }, (_, index) => {
          const shot = shots?.[String(index)] || shots?.[index];
          const hasShip = fleet.has(index);
          const mark = shot === 'hit' ? '×' : shot === 'miss' ? '·' : hasShip ? '■' : '';
          const cls = [
            'q-cell',
            shot === 'hit' ? 'is-hit' : '',
            shot === 'miss' ? 'is-miss' : '',
            !shot && hasShip ? 'is-ship' : '',
          ].filter(Boolean).join(' ');
          const row = Math.floor(index / SIZE) + 1;
          const col = (index % SIZE) + 1;
          return (
            <button
              key={index}
              type="button"
              className={cls}
              onClick={() => clickable && !shot && onFire(index)}
              disabled={disabled || !clickable || Boolean(shot)}
              aria-label={`第${row}行第${col}列${shot || (hasShip ? '舰' : '')}`}
            >
              {mark}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const BattleshipBoard = ({ G, ctx, moves, playerID }) => {
  const over = Boolean(ctx?.gameover);
  const myTurn = playerID != null && String(playerID) === String(ctx.currentPlayer) && !over;
  const seat = playerID == null ? null : String(playerID);
  const reveal = Boolean(G?.ships0 && G?.ships1);

  let leftShips = [];
  let rightShips = [];
  let leftShots = G?.shots0 || {};
  let rightShots = G?.shots1 || {};
  let leftLabel = 'A 海域';
  let rightLabel = 'B 海域';
  let fireRight = false;
  let fireLeft = false;

  if (seat === '0') {
    leftLabel = '己方海域';
    rightLabel = '对方海域';
    leftShips = G?.ships0 || [];
    rightShips = reveal ? (G?.ships1 || []) : [];
    fireRight = true;
  } else if (seat === '1') {
    leftLabel = '己方海域';
    rightLabel = '对方海域';
    leftShips = G?.ships1 || [];
    rightShips = reveal ? (G?.ships0 || []) : [];
    leftShots = G?.shots1 || {};
    rightShots = G?.shots0 || {};
    fireRight = true;
  } else {
    leftShips = G?.ships0 || [];
    rightShips = G?.ships1 || [];
  }

  const onFire = (cell) => {
    if (!myTurn) return;
    moves.makeMove(cell);
  };

  return (
    <div className="q-navy">
      <Grid
        label={leftLabel}
        ships={leftShips}
        shots={leftShots}
        clickable={fireLeft && myTurn}
        onFire={onFire}
        disabled={over || !myTurn}
      />
      <Grid
        label={rightLabel}
        ships={rightShips}
        shots={rightShots}
        clickable={fireRight && myTurn}
        onFire={onFire}
        disabled={over || !myTurn}
      />
    </div>
  );
};

export default BattleshipBoard;
