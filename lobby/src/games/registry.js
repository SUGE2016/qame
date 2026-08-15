import TicTacToeBoard from './TicTacToeBoard';
import GomokuBoard from './GomokuBoard';
import BattleshipBoard from './BattleshipBoard';

export const boards = {
  'tic-tac-toe': TicTacToeBoard,
  gomoku: GomokuBoard,
  battleship: BattleshipBoard,
};

export function boardFor(gameId) {
  return boards[gameId] || TicTacToeBoard;
}

export function gameTitle(gameId) {
  if (gameId === 'gomoku') return '五子棋';
  if (gameId === 'battleship') return '大海战';
  return 'Tic Tac Toe';
}

export function seatMark(gameId, seat) {
  if (gameId === 'gomoku') return Number(seat) === 0 ? '黑' : '白';
  if (gameId === 'battleship') return Number(seat) === 0 ? 'A' : 'B';
  return Number(seat) === 0 ? 'X' : 'O';
}
