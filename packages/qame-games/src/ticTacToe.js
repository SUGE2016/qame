const SIZE = 9;

function createState(options = {}) {
  return {
    cells: Array(SIZE).fill(null),
    matchId: options.matchId || null,
  };
}

function legalMoves(G) {
  if (!G?.cells) return [];
  return G.cells.map((c, i) => (c === null ? i : null)).filter((i) => i !== null);
}

function applyMove(G, playerId, move) {
  if (typeof move !== 'number' || move < 0 || move >= SIZE) {
    return { error: '无效位置' };
  }
  if (!G?.cells || G.cells[move] !== null) {
    return { error: '格子已被占用' };
  }
  const cells = G.cells.slice();
  cells[move] = String(playerId);
  return { G: { ...G, cells } };
}

function isVictory(cells, player) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  return lines.some((line) => line.every((i) => cells[i] === player));
}

function checkEnd(G) {
  if (!G?.cells) return null;
  if (G.cells.every((c) => c === null)) return null;
  for (const player of ['0', '1']) {
    if (isVictory(G.cells, player)) return { winner: player };
  }
  if (G.cells.every((c) => c !== null)) return { draw: true };
  return null;
}

module.exports = {
  id: 'tic-tac-toe',
  name: '井字棋',
  minPlayers: 2,
  maxPlayers: 2,
  createState,
  legalMoves,
  applyMove,
  checkEnd,
};
