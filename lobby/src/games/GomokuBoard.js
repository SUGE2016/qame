import React, { useEffect, useState } from 'react';

/**
 * 五子棋游戏界面组件
 * 
 * 9x9棋盘的五子棋游戏界面
 * 
 * @param {Object} G - 游戏状态对象
 * @param {Object} ctx - 游戏上下文对象
 * @param {Object} moves - 可用的移动函数
 * @param {string} playerID - 当前选手ID
 * @param {boolean} isActive - 当前选手是否处于活动状态
 * @param {Object} setupData - 设置数据
 */
const GomokuBoard = ({ G, ctx, moves, playerID, isActive, setupData, matchInfo, onGameEnd }) => {
  // 渲染调试信息（仅在开发模式显示）
  if (process.env.NODE_ENV === 'development') {
    console.log('[Gomoku Board] 渲染', { 
      playerID, 
      currentPlayer: ctx.currentPlayer, 
      gameover: ctx.gameover
    });
  }

  // 监听游戏结束状态
  useEffect(() => {
    if (ctx.gameover && onGameEnd) {
      onGameEnd(ctx.gameover);
    }
  }, [ctx.gameover, onGameEnd]);

  const BOARD_SIZE = 9;

  // 以回合为准，避免 isActive 异常导致无法行动
  const isMyTurn = playerID != null && playerID.toString() === ctx.currentPlayer && !ctx.gameover;
  


  /**
   * 处理格子点击事件
   * 
   * @param {number} position - 被点击的格子索引 (0-80)
   */
  const onClick = (position) => {
    if (
      typeof position === 'number' &&
      position >= 0 &&
      position < 81 &&
      isMyTurn &&
      playerID !== null &&
      G.cells &&
      G.cells[position] === null
    ) {
      moves.makeMove(position);
    }
  };

  /**
   * 将一维数组索引转换为二维坐标
   */
  const getPosition = (index) => ({
    row: Math.floor(index / BOARD_SIZE),
    col: index % BOARD_SIZE
  });

  /**
   * 获取选手棋子符号
   */
  const getPlayerSymbol = (player) => {
    return player === '0' ? '●' : '○';
  };

  /**
   * 获取选手颜色
   */
  const getPlayerColor = (player) => {
    return player === '0' ? '#2c3e50' : '#e74c3c';
  };

  /**
   * 检查是否是最后一步棋
   */
  const isLastMove = (position) => {
    return G.lastMove === position;
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
              {ctx.gameover.winner ? `选手 ${getPlayerSymbol(ctx.gameover.winner)} 获胜！` : '游戏平局！'}
            </h2>
            <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
              🎉 游戏结束！可使用上方"返回对战大厅"按钮回到大厅
            </p>
          </div>
        ) : (
          <div>
            <h3>当前选手: {getPlayerSymbol(ctx.currentPlayer)}</h3>
          </div>
        )}
      </div>

      {/* 五子棋棋盘 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
        gap: '2px',
        maxWidth: '450px',
        margin: '0 auto',
        backgroundColor: '#8B4513',
        padding: '10px',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
      }}>
        {G.cells.map((cell, index) => {
          const { row, col } = getPosition(index);
          const isCorner = (row === 0 || row === BOARD_SIZE - 1) && (col === 0 || col === BOARD_SIZE - 1);
          const isEdge = row === 0 || row === BOARD_SIZE - 1 || col === 0 || col === BOARD_SIZE - 1;
          const isCenter = row === Math.floor(BOARD_SIZE / 2) && col === Math.floor(BOARD_SIZE / 2);
          
          return (
            <button
              key={index}
              onClick={() => onClick(index)}
              disabled={!isMyTurn || cell !== null || ctx.gameover}
              style={{
                width: '40px',
                height: '40px',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                border: '1px solid #654321',
                backgroundColor: cell ? 'transparent' : '#DEB887',
                cursor: isMyTurn && cell === null && !ctx.gameover ? 'pointer' : 'not-allowed',
                color: cell === '0' ? '#2c3e50' : '#e74c3c',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '3px',
                // 最后一步高亮
                boxShadow: isLastMove(index) ? '0 0 0 3px #FFD700' : 'none',
                // 星位标记
                background: isCenter 
                  ? 'radial-gradient(circle, #8B4513 30%, #DEB887 30%)' 
                  : cell 
                    ? 'transparent' 
                    : '#DEB887'
              }}
              title={`行${row + 1}列${col + 1}`}
            >
              {cell === '0' ? '●' : cell === '1' ? '○' : ''}
            </button>
          );
        })}
      </div>

      {/* 游戏说明 */}
      <div style={{ 
        marginTop: '20px', 
        fontSize: '14px', 
        color: '#666',
        maxWidth: '400px',
        margin: '20px auto 0'
      }}>
        <p>🎯 五子棋规则：在9×9棋盘上，率先连成5子的选手获胜</p>
        <p>● 黑子先行，○ 白子后行</p>
        {G.lastMove !== null && (
          <p>✨ 最后一步：第{Math.floor(G.lastMove / 9) + 1}行第{G.lastMove % 9 + 1}列</p>
        )}
      </div>


    </div>
  );
};

export default GomokuBoard;
