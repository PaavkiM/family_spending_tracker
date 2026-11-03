import crypto from 'node:crypto';

const SESSION_COOKIE = 'fst_session';

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  const missingOrDefault = !secret || secret === 'change-me-to-a-long-random-string';

  if (missingOrDefault) {
    if (isProd) {
      // In production, refuse to run with an insecure/forgeable session secret.
      throw new Error(
        '[auth] SESSION_SECRET must be set to a strong, unique value in production. ' +
          'Refusing to start with the insecure development fallback.'
      );
    }
    console.warn(
      '[auth] SESSION_SECRET is unset or default. Using an insecure fallback — ' +
        'for local development only. Set a strong secret before deploying.'
    );
    return 'insecure-development-secret';
  }

  return secret;
}

function sessionDays() {
  const n = Number(process.env.SESSION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/**
 * A session token is "<expiryMs>.<hmac>". The HMAC signs the expiry with the
 * server secret, so a client cannot forge or extend a session.
 */
function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function createToken() {
  const expiry = Date.now() + sessionDays() * 24 * 60 * 60 * 1000;
  const payload = String(expiry);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return false;

  const expected = sign(payload);
  // Constant-time comparison to avoid timing attacks.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  const expiry = Number(payload);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

  return true;
}

/** Validate the submitted family password (constant-time compare). */
export function checkPassword(submitted) {
  const expected = process.env.APP_PASSWORD || '';
  if (!expected) {
    console.error('[auth] APP_PASSWORD is not set — login is disabled.');
    return false;
  }
  const a = Buffer.from(String(submitted));
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still spend the compare to keep timing uniform.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function setSessionCookie(res) {
  res.cookie(SESSION_COOKIE, createToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: sessionDays() * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE);
}

/** Express middleware: block API requests that lack a valid session. */
export function requireAuth(req, res, next) {
  if (verifyToken(req.cookies?.[SESSION_COOKIE])) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

export function isAuthed(req) {
  return verifyToken(req.cookies?.[SESSION_COOKIE]);
}

export { SESSION_COOKIE };
