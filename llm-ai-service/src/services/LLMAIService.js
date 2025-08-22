// 使用Node.js 18+内置的fetch
const fetch = globalThis.fetch;

class LLMAIService {
  constructor() {
    this.defaultConfig = {
      endpoint: process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions',
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL || 'ecnu-plus',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 100,
      temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7,
      timeout: parseInt(process.env.LLM_TIMEOUT) || 10000,
      systemPrompt: process.env.LLM_SYSTEM_PROMPT || '你是一个聪明的游戏AI助手。请分析游戏状态并选择最佳移动。'
    };

    console.log('🧠 [LLM AI Service] 初始化完成');
    console.log('📝 [LLM AI Service] 默认配置:', {
      endpoint: this.defaultConfig.endpoint,
      model: this.defaultConfig.model,
      hasApiKey: !!this.defaultConfig.apiKey,
      maxTokens: this.defaultConfig.maxTokens,
      temperature: this.defaultConfig.temperature
    });
  }

  /**
   * 调用LLM获取AI移动
   * @param {string} prompt - 游戏状态描述
   * @param {object} customConfig - 自定义LLM配置
   * @returns {Promise<number>} 移动位置，-1表示失败
   */
  async getAIMove(prompt, customConfig = {}) {
    const config = { ...this.defaultConfig, ...customConfig };

    if (!config.apiKey) {
      console.error('❌ [LLM AI Service] 缺少API密钥');
      return -1;
    }

        try {
      console.log('🧠 [LLM AI Service] 调用LLM API...');
      console.log('📤 [LLM AI Service] 请求配置:', {
        endpoint: config.endpoint,
        model: config.model,
        hasApiKey: !!config.apiKey,
        timeout: config.timeout
      });

      const requestBody = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: config.systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: config.maxTokens,
        temperature: config.temperature
      };

      console.log('📤 [LLM AI Service] 请求配置:', {
        endpoint: config.endpoint,
        model: config.model,
        hasApiKey: !!config.apiKey,
        timeout: config.timeout || 'default'
      });
      console.log('📤 [LLM AI Service] 请求体:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('❌ [LLM AI Service] LLM API请求失败:', response.status, await response.text());
        return -1;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      console.log('🧠 [LLM AI Service] LLM响应:', { content });

      // 尝试从响应中提取数字
      const move = this.extractMoveFromResponse(content);
      
      return move;

    } catch (error) {
      console.error('❌ [LLM AI Service] LLM调用失败:', error.message);
      return -1;
    }
  }

  /**
   * 从LLM响应中提取移动
   * @param {string} content - LLM响应内容
   * @returns {number} 移动位置，-1表示提取失败
   */
  extractMoveFromResponse(content) {
    if (!content) return -1;

    // 方式1: 直接解析为数字
    const directNumber = parseInt(content);
    if (!isNaN(directNumber)) {
      return directNumber;
    }

    // 方式2: 查找第一个数字
    const numberMatch = content.match(/\d+/);
    if (numberMatch) {
      return parseInt(numberMatch[0]);
    }

    console.warn('⚠️ [LLM AI Service] 无法从响应中提取有效移动:', content);
    return -1;
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
}

module.exports = LLMAIService;
