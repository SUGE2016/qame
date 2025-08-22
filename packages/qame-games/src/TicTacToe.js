const { INVALID_MOVE } = require('boardgame.io/core');

/**
 * 井字棋游戏逻辑 - QAME平台内置游戏
 */
const TicTacToe = {
  name: 'tic-tac-toe',
  
  setup: (ctx, setupData) => {
    console.log('🔥 [SETUP] TicTacToe游戏初始化');
    console.log('🔥 [SETUP] setupData:', setupData);
    
    return {
      cells: Array(9).fill(null),
      matchId: setupData?.matchId || null,
    };
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
  },

  minPlayers: 2,
  maxPlayers: 2,

  moves: {
    // 通用移动方法
    makeMove({ G, playerID }, id) {
      // 检查位置是否有效
      if (id < 0 || id >= 9) {
        return INVALID_MOVE;
      }
      
      // 检查位置是否已被占用
      if (G.cells[id] !== null) {
        return INVALID_MOVE;
      }
      
      // 放置棋子
      G.cells[id] = playerID;
      console.log(`✅ 选手 ${playerID} 在位置 ${id} 放置棋子`);
    },
    
    reportAIError({ G }, message) {
      G.aiError = typeof message === 'string' ? message : 'AI unavailable';
    },
  },

  endIf: ({ G, ctx }) => {
    if (!G || !ctx || !G.cells) {
      return;
    }
    
    const isEmptyBoard = G.cells.every(cell => cell === null);
    if (isEmptyBoard) {
      return;
    }
    
    for (let player of ['0', '1']) {
      const isWinner = IsPlayerVictory(G.cells, player);
      if (isWinner) {
        console.log(`🏆 服务器端：选手 ${player} 获胜!`);
        return { winner: player };
      }
    }
    
    if (IsDraw(G.cells)) {
      console.log('🤝 服务器端：游戏平局!');
      return { draw: true };
    }
  },

  onEnd: ({ G, ctx }) => {
    console.log('🎮 游戏结束，最终状态:', { G, ctx });
  },
};

/**
 * 检查指定选手是否获胜
 */
function IsPlayerVictory(cells, player) {
  const positions = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // 行
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // 列
    [0, 4, 8], [2, 4, 6] // 对角线
  ];

  return positions.some(row => {
    return row.every(index => cells[index] === player);
  });
}

/**
 * 检查是否平局
 */
function IsDraw(cells) {
  return cells.every(cell => cell !== null);
}

module.exports = { TicTacToe };
