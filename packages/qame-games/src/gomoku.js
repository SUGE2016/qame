const BOARD_SIZE = 9;
const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

function createState(options = {}) {
  return {
    cells: Array(CELL_COUNT).fill(null),
    matchId: options.matchId || null,
    lastMove: null,
  };
}

function legalMoves(G) {
  if (!G?.cells) return [];
  return G.cells.map((c, i) => (c === null ? i : null)).filter((i) => i !== null);
}

function applyMove(G, playerId, move) {
  if (typeof move !== 'number' || move < 0 || move >= CELL_COUNT) {
    return { error: '无效位置' };
  }
  if (!G?.cells || G.cells[move] !== null) {
    return { error: '格子已被占用' };
  }
  const cells = G.cells.slice();
  cells[move] = String(playerId);
  return { G: { ...G, cells, lastMove: move } };
}

function isVictory(cells, player) {
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 },
  ];
  const getIndex = (row, col) => row * BOARD_SIZE + col;

  for (let i = 0; i < CELL_COUNT; i++) {
    if (cells[i] !== player) continue;
    const row = Math.floor(i / BOARD_SIZE);
    const col = i % BOARD_SIZE;

    for (const { dr, dc } of directions) {
      let count = 1;
      for (let step = 1; step < 5; step++) {
        const r = row + dr * step;
        const c = col + dc * step;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
        if (cells[getIndex(r, c)] === player) count++;
        else break;
      }
      for (let step = 1; step < 5; step++) {
        const r = row - dr * step;
        const c = col - dc * step;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
        if (cells[getIndex(r, c)] === player) count++;
        else break;
      }
      if (count >= 5) return true;
    }
  }
  return false;
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
  id: 'gomoku',
  name: '五子棋',
  minPlayers: 2,
  maxPlayers: 2,
  createState,
  legalMoves,
  applyMove,
  checkEnd,
};
