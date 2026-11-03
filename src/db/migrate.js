import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pool, { query } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_CATEGORIES = [
  ['Groceries', '#22c55e'],
  ['Rent/Mortgage', '#ef4444'],
  ['Utilities', '#3b82f6'],
  ['Transport', '#f59e0b'],
  ['Dining Out', '#ec4899'],
  ['Healthcare', '#14b8a6'],
  ['Entertainment', '#8b5cf6'],
  ['Other', '#64748b'],
];

/**
 * Create tables and seed default categories.
 * Running this repeatedly is safe — it only adds what's missing.
 */
export async function migrate() {
  const schema = await readFile(join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
  console.log('[migrate] Schema applied.');

  for (const [name, color] of DEFAULT_CATEGORIES) {
    await query(
      `INSERT INTO categories (name, color)
       VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [name, color]
    );
  }
  console.log('[migrate] Default categories ensured.');
}

// Allow running directly:  npm run migrate
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => {
      console.log('[migrate] Done.');
      return pool.end();
    })
    .catch((err) => {
      console.error('[migrate] Failed:', err);
      process.exit(1);
    });
}
