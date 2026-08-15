// 会话过期处理（全局一次）
function handleSessionExpired() {
  if (window.__SESSION_EXPIRED_HANDLED__) return;
  window.__SESSION_EXPIRED_HANDLED__ = true;
  try {
    sessionStorage.removeItem('user');
    sessionStorage.setItem('sessionExpired', '1');
  } catch (_) {}
  // 跳回首页，让App根据user状态渲染登录页
  setTimeout(() => {
    window.location.href = '/';
  }, 50);
}

// 统一的API调用函数（同源相对路径）
export const apiCall = async (url, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  try {
    const token = sessionStorage.getItem('accessToken');
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (_) {}
  const defaultOptions = {
    credentials: 'include',
    headers
  };

  // 使用同源相对路径，交由Nginx反向代理
  const response = await fetch(`${url}`, {
    ...defaultOptions,
    ...options
  });

  // 会话过期统一处理
  if (response.status === 401) {
    // 仅当之前处于已登录状态（本地有user）时才触发自动跳转，
    // 避免登录页初次verify(401)导致无限刷新
    try {
      const hadUser = !!sessionStorage.getItem('user');
      if (hadUser) {
        handleSessionExpired();
      }
    } catch (_) {}
    // 返回标准化结构，避免调用方崩溃
    return { code: 401, message: '登录已过期，请重新登录', data: null };
  }

  return response.json();
};

// 常用的API调用方法
export const api = {
  // 通用HTTP方法
  get: (url) => apiCall(url),
  post: (url, data) => apiCall(url, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  put: (url, data) => apiCall(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  delete: (url) => apiCall(url, { method: 'DELETE' }),
  // 认证相关
  verify: () => apiCall('/api/auth/verify'),
  login: (credentials) => apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  }),
  logout: () => apiCall('/api/auth/logout', { method: 'POST' }),

  // 管理员相关
  getUsers: (page = 1, limit = 20, filters = {}) => {
    const params = new URLSearchParams({ page, limit });
    Object.entries(filters).forEach(([k, v]) => {
      if (v != null && v !== '' && v !== 'all') params.set(k, v);
    });
    return apiCall(`/api/admin/users?${params}`);
  },
  createUser: (userData) => apiCall('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),
  updateUser: (userId, userData) => apiCall(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(userData)
  }),
  deleteUser: (userId) => apiCall(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  getStats: () => apiCall('/api/admin/stats'),
  getAdminOverview: () => apiCall('/api/admin/overview'),
  getAdminAudit: (page = 1, limit = 20, filters = {}) => {
    const params = new URLSearchParams({ page, limit });
    Object.entries(filters).forEach(([k, v]) => {
      if (v != null && v !== '' && v !== 'all') params.set(k, v);
    });
    return apiCall(`/api/admin/audit?${params}`);
  },
  createGame: (gameData) => apiCall('/api/admin/games', {
    method: 'POST',
    body: JSON.stringify(gameData)
  }),
  updateGame: (gameId, gameData) => apiCall(`/api/admin/games/${gameId}`, {
    method: 'PUT',
    body: JSON.stringify(gameData)
  }),
  deleteGame: (gameId) => apiCall(`/api/admin/games/${gameId}`, { method: 'DELETE' }),

  // 游戏相关
  getGames: () => apiCall('/api/games'),

  // Player相关
  getMyPlayer: () => apiCall('/api/players/me'),

  // Match相关
  getMatches: (filters = {}) => {
    const params = new URLSearchParams(filters);
    return apiCall(`/api/matches?${params}`);
  },
  createMatch: (matchData) => apiCall('/api/matches', {
    method: 'POST',
    body: JSON.stringify(matchData)
  }),
  getMatch: (matchId) => apiCall(`/api/matches/${matchId}`),
  deleteMatch: (matchId) => apiCall(`/api/matches/${matchId}`, { method: 'DELETE' }),
  deleteMatches: (ids) => apiCall('/api/matches/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids })
  }),
  getMatchHistory: (matchId) => apiCall(`/api/stats/matches/${matchId}/history`),
  addPlayerToMatch: (matchId, playerData) => apiCall(`/api/matches/${matchId}/players`, {
    method: 'POST',
    body: JSON.stringify(playerData)
  }),
  removePlayerFromMatch: (matchId, playerId) => apiCall(`/api/matches/${matchId}/players/${playerId}`, { method: 'DELETE' }),
  startMatch: (matchId) => apiCall(`/api/matches/${matchId}/start`, { method: 'POST' }),
  cancelMatch: (matchId) => apiCall(`/api/matches/${matchId}/cancel`, { method: 'POST' }),
  checkGameStatus: (matchId) => apiCall(`/api/matches/${matchId}/check-game-status`, { method: 'POST' }),
  getCredentials: (matchId) => apiCall(`/api/matches/${matchId}/credentials`)
}; 