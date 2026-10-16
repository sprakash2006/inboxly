import { env } from '../config/env.js';

// Cookies are intentionally an additional transport, not a replacement for the
// existing Authorization header. API clients and existing browser tabs can
// continue to send Bearer tokens while a browser gains an HttpOnly fallback.
export const ACCESS_TOKEN_COOKIE = 'inboxly_access';
export const REFRESH_TOKEN_COOKIE = 'inboxly_refresh';

const isSecure = env.NODE_ENV === 'production';

const accessCookie = {
  httpOnly: true,
  secure: isSecure,
  sameSite: 'lax',
  path: '/',
  maxAge: 15 * 60_000,
};

const refreshCookie = {
  httpOnly: true,
  secure: isSecure,
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60_000,
};

export function readCookie(req, name) {
  const source = req.headers?.cookie;
  if (!source) return null;
  for (const part of source.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

export function accessTokenFromRequest(req) {
  const header = req.headers?.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return readCookie(req, ACCESS_TOKEN_COOKIE);
}

export function refreshTokenFromRequest(req) {
  return typeof req.body?.refreshToken === 'string' && req.body.refreshToken
    ? req.body.refreshToken
    : readCookie(req, REFRESH_TOKEN_COOKIE);
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  if (accessToken) res.cookie(ACCESS_TOKEN_COOKIE, accessToken, accessCookie);
  if (refreshToken) res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshCookie);
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...accessCookie, maxAge: undefined });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...refreshCookie, maxAge: undefined });
}
