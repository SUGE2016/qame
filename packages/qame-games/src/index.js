/**
 * QAME 纯函数规则核（无 boardgame.io）
 */

const ticTacToe = require('./ticTacToe.js');
const gomoku = require('./gomoku.js');

const GAMES = {
  [ticTacToe.id]: ticTacToe,
  [gomoku.id]: gomoku,
};

function getGame(gameId) {
  const game = GAMES[gameId];
  if (!game) throw new Error(`游戏 "${gameId}" 不存在`);
  return game;
}

function createState(gameId, options = {}) {
  return getGame(gameId).createState(options);
}

function legalMoves(gameId, G, playerId) {
  return getGame(gameId).legalMoves(G, playerId);
}

function applyMove(gameId, G, playerId, move) {
  return getGame(gameId).applyMove(G, playerId, move);
}

function checkEnd(gameId, G) {
  return getGame(gameId).checkEnd(G);
}

function getAllGames() {
  return Object.keys(GAMES);
}

module.exports = {
  GAMES,
  getGame,
  getAllGames,
  createState,
  legalMoves,
  applyMove,
  checkEnd,
  // 兼容旧命名（仅扩展名，不再是 bgio Game 对象）
  TicTacToe: ticTacToe,
  Gomoku: gomoku,
};
