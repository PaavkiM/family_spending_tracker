-- ──────────────────────────────────────────────────────────────
-- Family Spending Tracker — database schema
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entries (
    id            SERIAL PRIMARY KEY,
    description   TEXT NOT NULL,
    amount        NUMERIC(12, 2) NOT NULL,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    spent_on      DATE NOT NULL,

    -- Recurrence
    is_recurring  BOOLEAN NOT NULL DEFAULT false,
    -- 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
    recur_interval TEXT NOT NULL DEFAULT 'none',
    -- NULL end date means "recurring forever"
    recur_until   DATE,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entries_spent_on    ON entries (spent_on);
CREATE INDEX IF NOT EXISTS idx_entries_category_id ON entries (category_id);
