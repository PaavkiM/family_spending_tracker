import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  checkPassword,
  setSessionCookie,
  clearSessionCookie,
  isAuthed,
} from '../auth.js';

const router = Router();

// Throttle login attempts to slow down password guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes.' },
});

router.get('/status', (req, res) => {
  res.json({ authenticated: isAuthed(req) });
});

router.post('/login', loginLimiter, (req, res) => {
  const password = req.body?.password;
  if (!checkPassword(password)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  setSessionCookie(res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
