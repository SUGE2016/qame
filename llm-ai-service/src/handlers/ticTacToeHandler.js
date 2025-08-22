/**
 * 井字棋游戏处理器
 * 实现标准的 /move 接口逻辑
 */

class TicTacToeHandler {
  /**
   * 获取AI移动决策
   * @param {LLMAIService} llmAI - LLM AI服务实例
   * @param {object} G - boardgame.io游戏数据
   * @param {object} metadata - 元数据
   * @returns {Promise<number>} 移动位置
   */
  async getMove(llmAI, G, metadata = {}) {
    try {
      // 计算有效移动
      const validMoves = this.calculateValidMoves(G.cells);
      if (validMoves.length === 0) {
        console.warn('⚠️ [井字棋] 没有有效移动');
        return -1;
      }
      
      // 生成游戏状态描述的提示词
      const prompt = this.generatePrompt(G, validMoves, metadata);
      
      // 调用LLM获取移动
      const move = await llmAI.getAIMove(prompt);

      // 验证移动是否有效
      if (!this.isValidMove(move, validMoves)) {
        console.warn(`⚠️ [井字棋] LLM返回无效移动 ${move}, 有效移动: ${validMoves}`);
        return -2;
      }
      
      console.log(`✅ [井字棋] LLM选择移动: ${move}`);
      return move;
      
    } catch (error) {
      console.error('❌ [井字棋] 处理移动失败:', error);      
      return -1;
    }
  }

  /**
   * 计算有效移动
   * @param {array} cells - 棋盘状态数组
   * @returns {array} 有效移动位置数组
   */
  calculateValidMoves(cells) {
    const validMoves = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === null || cells[i] === undefined) {
        validMoves.push(i);
      }
    }
    return validMoves;
  }

  /**
   * 验证移动是否有效
   * @param {number} move - 移动位置
   * @param {array} validMoves - 有效移动列表
   * @returns {boolean} 是否有效
   */
  isValidMove(move, validMoves) {
    return validMoves.includes(move);
  }

  /**
   * 生成LLM提示词
   * @param {object} G - boardgame.io游戏数据
   * @param {array} validMoves - 有效移动列表
   * @param {object} metadata - 元数据
   * @returns {string} 提示词
   */
  generatePrompt(G, validMoves, metadata) {
    const { cells } = G;
    const { turn = 0, current_player } = metadata;
    
    // 将棋盘状态转换为可读格式
    const board = this.formatBoard(cells);
    
    // 确定当前选手符号
    const currentPlayerSymbol = current_player === '0' ? 'X' : 'O';
    const opponentSymbol = current_player === '0' ? 'O' : 'X';
    
    const prompt = `
当前井字棋棋盘状态：
${board}

图例：X = 选手X，O = 选手O，数字 = 可选位置
可选移动位置：${validMoves.join(', ')}
当前移动轮次：${turn + 1}
你是选手：${currentPlayerSymbol}
对手是选手：${opponentSymbol}

请分析棋盘状态，选择最佳移动位置。优先考虑：
1. 如果能获胜，立即选择获胜位置
2. 如果对手下一步能获胜，阻挡对手
3. 选择战略性最好的位置（中心 > 角落 > 边缘）

请只返回一个数字（0-8），表示你选择的位置。
`;

    return prompt.trim();
  }

  /**
   * 格式化棋盘为可读形式
   * @param {array} cells - 棋盘状态数组
   * @returns {string} 格式化的棋盘
   */
  formatBoard(cells) {
    const display = cells.map((cell, index) => {
      if (cell === null) return index.toString();
      // 将playerID转换为传统的X/O符号
      return cell === '0' ? 'X' : 'O';
    });

    return `
 ${display[0]} | ${display[1]} | ${display[2]} 
-----------
 ${display[3]} | ${display[4]} | ${display[5]} 
-----------
 ${display[6]} | ${display[7]} | ${display[8]} 
`;
  }
}

module.exports = new TicTacToeHandler();
