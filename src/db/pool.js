import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error(
    '\n[ERROR] DATABASE_URL is not set.\n' +
      'Set it to your Neon pooled connection string (see .env.example).\n'
  );
}

/**
 * A single shared connection pool for the whole app.
 *
 * Render runs a long-lived Node process, so a standard TCP pool against
 * Neon's POOLED endpoint is the recommended, most robust setup.
 *
 * SSL is required by Neon. We allow self-signed in the chain because Neon
 * terminates TLS with a certificate that Node's default bundle accepts, but
 * `rejectUnauthorized: false` keeps things working across environments.
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Keep the local pool modest — Neon's pooler handles the rest.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // A pooled client can be dropped when Neon scales to zero. The pool
  // recovers on the next query, so we just log and keep running.
  console.error('[db] Unexpected idle client error:', err.message);
});

/** Run a parameterised query. */
export function query(text, params) {
  return pool.query(text, params);
}

/** Grab a client for a transaction. Remember to release it. */
export function getClient() {
  return pool.connect();
}

export default pool;
