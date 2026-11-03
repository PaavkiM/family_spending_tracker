import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { migrate } from './db/migrate.js';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import entryRoutes from './routes/entries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const app = express();

// Render sits behind a proxy; trust it so secure cookies work.
app.set('trust proxy', 1);

app.use(express.json());
app.use(cookieParser());

// Health check (handy for Render).
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// API.
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/entries', entryRoutes);

// Static frontend.
app.use(express.static(PUBLIC_DIR));

// SPA-style fallback for any non-API GET.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(join(PUBLIC_DIR, 'index.html'));
});

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    // Auto-apply schema + seed on boot so a fresh Neon DB just works.
    await migrate();
  } catch (err) {
    console.error('[startup] Migration failed:', err.message);
    console.error('[startup] Check DATABASE_URL. Starting server anyway.');
  }

  app.listen(PORT, () => {
    console.log(`Family Spending Tracker running on port ${PORT}`);
  });
}

start();
