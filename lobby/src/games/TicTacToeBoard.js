import React, { useEffect } from 'react';

/**
 * 井字棋游戏界面组件
 * 
 * 统一处理所有选手，不区分AI和人类选手
 * 
 * @param {Object} G - 游戏状态对象
 * @param {Object} ctx - 游戏上下文对象
 * @param {Object} moves - 可用的移动函数
 * @param {string} playerID - 当前选手ID
 * @param {boolean} isActive - 当前选手是否处于活动状态
 * @param {Object} setupData - 设置数据
 */
const TicTacToeBoard = ({ G, ctx, moves, playerID, isActive, setupData, matchInfo, onGameEnd }) => {
  // 渲染调试信息（仅在开发模式显示）
  console.debug('[Board] 渲染', { 
    playerID, 
    currentPlayer: ctx.currentPlayer, 
    gameover: ctx.gameover
  });

  // 监听游戏结束状态
  useEffect(() => {
    if (ctx.gameover && onGameEnd) {
      onGameEnd(ctx.gameover);
    }
  }, [ctx.gameover, onGameEnd]);

  // 以回合为准，避免 isActive 异常导致无法行动
  const isMyTurn = playerID != null && playerID.toString() === ctx.currentPlayer && !ctx.gameover;

  /**
   * 处理格子点击事件
   * 
   * ⚠️ 注意：moves.makeMove 的参数传递方式非常重要！
   * 
   * 🔧 boardgame.io 调用机制：
   * 1. 这里调用 moves.makeMove(id) 时，boardgame.io 会直接传递 id 参数
   * 2. 游戏逻辑中的函数会直接接收到 id 参数
   * 3. 所以这里直接传递 id 是正确的，不要改为 moves.makeMove([id])
   * 
   * 🚫 错误的调用方式：
   * - moves.makeMove([id])  // 错误！会导致参数传递问题
   * 
   * ✅ 正确的调用方式：
   * - moves.makeMove(id)    // 正确！boardgame.io 会直接传递
   * 
   * @param {number} id - 被点击的格子索引 (0-8)
   */
  const onClick = (id) => {
    if (
      typeof id === 'number' &&
      id >= 0 &&
      id < 9 &&
      isMyTurn &&
      playerID !== null &&
      G.cells &&
      G.cells[id] === null
    ) {
      moves.makeMove(id);
    }
  };

  const getPlayerSymbol = (player) => {
    return player === '0' ? 'X' : 'O';
  };

  const getPlayerColor = (player) => {
    return player === '0' ? '#2196F3' : '#F44336';
  };

  let gameStatus = '';
  
  if (ctx.gameover) {
    if (ctx.gameover.winner) {
      gameStatus = <div style={{ textAlign: 'center', fontSize: '1.5rem', color: '#4CAF50', margin: '1rem 0' }}>
        🎉 选手 {getPlayerSymbol(ctx.gameover.winner)} 获胜！
      </div>;
    } else if (ctx.gameover.draw) {
      gameStatus = <div style={{ textAlign: 'center', fontSize: '1.5rem', color: '#FF9800', margin: '1rem 0' }}>
        🤝 游戏平局！
      </div>;
    }
  } else {
    const currentPlayerSymbol = getPlayerSymbol(ctx.currentPlayer);
    
    gameStatus = (
      <div style={{ textAlign: 'center', fontSize: '1.2rem', margin: '2rem 0' }}>
        当前选手: <span style={{ color: getPlayerColor(ctx.currentPlayer) }}>
          {currentPlayerSymbol}
        </span>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      {/* 游戏状态显示 */}
      <div style={{ marginBottom: '20px' }}>
        {ctx.gameover ? (
          <div>
            <h2 style={{ color: '#4caf50' }}>
              {ctx.gameover.winner ? `选手 ${ctx.gameover.winner} 获胜！` : '游戏平局！'}
            </h2>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
              🎉 游戏结束！可使用上方"返回对战大厅"按钮回到大厅
            </p>
          </div>
        ) : (
          <div>
            <h3>当前选手: {ctx.currentPlayer}</h3>
          </div>
        )}
      </div>

      {/* 游戏棋盘 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '5px',
        maxWidth: '300px',
        margin: '0 auto'
      }}>
        {G.cells.map((cell, index) => (
          <button
            key={index}
            onClick={() => onClick(index)}
            disabled={!isMyTurn || cell !== null || ctx.gameover}
            style={{
              width: '80px',
              height: '80px',
              fontSize: '2rem',
              fontWeight: 'bold',
              border: '2px solid #333',
              backgroundColor: cell ? '#e0e0e0' : '#fff',
              cursor: isMyTurn && cell === null && !ctx.gameover ? 'pointer' : 'not-allowed',
              color: cell === '0' ? '#f44336' : '#2196f3'
            }}
          >
            {cell === '0' ? 'X' : cell === '1' ? 'O' : ''}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TicTacToeBoard;