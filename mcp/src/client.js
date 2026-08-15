import crypto from 'node:crypto';

const BASE = (process.env.QAME_URL || 'http://localhost:8001').replace(/\/$/, '');
const SALT = process.env.QAME_PASSWORD_SALT || process.env.PASSWORD_SALT || 'your_fixed_salt_here';

/** @type {{ token: string|null, refreshToken: string|null, playerId: string|null, seats: Map<string,string> }} */
export const session = {
  token: process.env.QAME_TOKEN || null,
  refreshToken: process.env.QAME_REFRESH_TOKEN || null,
  playerId: null,
  /** matchId -> seatToken */
  seats: new Map(),
};

export function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

export async function api(method, path, { body, seatToken, auth = true, _retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  if (seatToken) {
    headers.Authorization = `Bearer ${seatToken}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`QAME ${method} ${path} → HTTP ${res.status} (非 JSON)`);
  }

  if (
    !_retried &&
    auth &&
    !seatToken &&
    session.refreshToken &&
    (res.status === 401 || data.code === 401)
  ) {
    const ok = await refreshAccessToken();
    if (ok) {
      return api(method, path, { body, seatToken, auth, _retried: true });
    }
  }

  if (!res.ok || (data.code && data.code >= 400)) {
    throw new Error(data.message || `QAME ${method} ${path} → ${res.status}`);
  }
  return data.data !== undefined ? data.data : data;
}

export async function refreshAccessToken() {
  if (!session.refreshToken) return false;
  try {
    const data = await api('POST', '/api/auth/refresh', {
      auth: false,
      body: { refreshToken: session.refreshToken },
    });
    if (data.accessToken) {
      session.token = data.accessToken;
      if (data.refreshToken) {
        session.refreshToken = data.refreshToken;
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function login(username, password) {
  const hashedPassword = hashPassword(password);
  const data = await api('POST', '/api/auth/login', {
    auth: false,
    body: { username, password, hashedPassword },
  });
  if (!data.accessToken) {
    throw new Error('登录成功但未返回 accessToken，请确认平台版本');
  }
  session.token = data.accessToken;
  session.refreshToken = data.refreshToken || null;
  return data;
}

export async function ensurePlayer() {
  const player = await api('POST', '/api/players/me/ensure', { body: {} });
  session.playerId = player.id;
  return player;
}

export async function autoLoginIfConfigured() {
  if (session.token) return { mode: 'token' };
  const u = process.env.QAME_USERNAME;
  const p = process.env.QAME_PASSWORD;
  if (u && p) {
    await login(u, p);
    await ensurePlayer();
    return { mode: 'password', username: u };
  }
  return { mode: 'none' };
}

export function textResult(obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: 'text', text }] };
}

export function errorResult(err) {
  return {
    content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }],
    isError: true,
  };
}
