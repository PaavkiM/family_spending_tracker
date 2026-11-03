import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../auth.js';
import { expandEntry, isValidInterval, parseDate } from '../recurrence.js';

const router = Router();
router.use(requireAuth);

const SELECT_WITH_CATEGORY = `
  SELECT e.id, e.description, e.amount, e.category_id, e.spent_on,
         e.is_recurring, e.recur_interval, e.recur_until,
         c.name  AS category_name,
         c.color AS category_color
  FROM entries e
  LEFT JOIN categories c ON c.id = e.category_id
`;

// NUMERIC(12,2) holds up to 9,999,999,999.99.
const MAX_AMOUNT = 9_999_999_999.99;

/** True only for a whole number > 0 (valid for DB SERIAL ids). */
function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

/**
 * Parse a route :id param. Returns a positive integer, or null if invalid
 * (non-numeric, zero, negative, or fractional).
 */
function parseId(raw) {
  const n = Number(raw);
  return isPositiveInt(n) ? n : null;
}

function validateEntryBody(body) {
  const description = String(body.description || '').trim();
  const amount = Number(body.amount);
  const spent_on = String(body.spent_on || '').trim();
  const category_id =
    body.category_id === null || body.category_id === '' || body.category_id === undefined
      ? null
      : Number(body.category_id);
  const is_recurring = Boolean(body.is_recurring);
  const recur_interval = is_recurring ? String(body.recur_interval || 'monthly') : 'none';
  // Empty / missing recur_until means "forever".
  const recur_until =
    is_recurring && body.recur_until ? String(body.recur_until).trim() : null;

  if (description.length > 200) return { error: 'Description is too long (max 200).' };
  if (!Number.isFinite(amount)) return { error: 'Amount must be a number.' };
  if (amount < 0) return { error: 'Amount cannot be negative.' };
  if (amount > MAX_AMOUNT) {
    return { error: `Amount is too large (max ${MAX_AMOUNT}).` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spent_on)) {
    return { error: 'Date must be in YYYY-MM-DD format.' };
  }
  if (category_id !== null && !isPositiveInt(category_id)) {
    return { error: 'Invalid category.' };
  }
  if (is_recurring) {
    if (!isValidInterval(recur_interval) || recur_interval === 'none') {
      return { error: 'Choose a valid recurring interval.' };
    }
    if (recur_until) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(recur_until)) {
        return { error: 'Recurring end date must be YYYY-MM-DD.' };
      }
      if (parseDate(recur_until) < parseDate(spent_on)) {
        return { error: 'Recurring end date cannot be before the start date.' };
      }
    }
  }

  return {
    value: {
      description,
      amount,
      spent_on,
      category_id,
      is_recurring,
      recur_interval,
      recur_until,
    },
  };
}

/**
 * GET /api/entries
 * Query params: month (1-12), year, category_id.
 * Returns expanded occurrences (recurring entries become multiple rows) plus
 * a summary total, all within the requested window.
 */
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();

    // Validate optional query params; reject bad input with a 400.
    let year = null;
    if (req.query.year !== undefined && req.query.year !== '') {
      year = Number(req.query.year);
      if (!Number.isInteger(year) || year < 1970 || year > 9999) {
        return res.status(400).json({ error: 'Year must be a whole number between 1970 and 9999.' });
      }
    }

    let month = null; // 1-12
    if (req.query.month !== undefined && req.query.month !== '') {
      month = Number(req.query.month);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Month must be a whole number between 1 and 12.' });
      }
    }

    // A month filter only makes sense together with a year.
    if (month && !year) {
      return res.status(400).json({ error: 'Select a year when filtering by month.' });
    }

    let categoryId = null;
    if (req.query.category_id !== undefined && req.query.category_id !== '') {
      categoryId = Number(req.query.category_id);
      if (!isPositiveInt(categoryId)) {
        return res.status(400).json({ error: 'Invalid category filter.' });
      }
    }

    // Work out the display window.
    let windowStart;
    let windowEnd;
    if (year && month) {
      windowStart = new Date(Date.UTC(year, month - 1, 1));
      windowEnd = new Date(Date.UTC(year, month, 0)); // last day of month
    } else if (year) {
      windowStart = new Date(Date.UTC(year, 0, 1));
      windowEnd = new Date(Date.UTC(year, 11, 31));
    } else {
      // Default: a wide window so "all history" shows, but capped at +2 years
      // ahead so "forever" recurrences don't explode.
      windowStart = new Date(Date.UTC(1970, 0, 1));
      windowEnd = new Date(Date.UTC(now.getUTCFullYear() + 2, 11, 31));
    }

    const params = [];
    let where = '';
    if (categoryId) {
      params.push(categoryId);
      where = `WHERE e.category_id = $${params.length}`;
    }

    const { rows } = await query(
      `${SELECT_WITH_CATEGORY} ${where} ORDER BY e.spent_on DESC, e.id DESC`,
      params
    );

    let occurrences = [];
    for (const row of rows) {
      occurrences = occurrences.concat(expandEntry(row, windowStart, windowEnd));
    }

    // Newest first.
    occurrences.sort((a, b) =>
      a.occurrence_date < b.occurrence_date ? 1 : a.occurrence_date > b.occurrence_date ? -1 : 0
    );

    const total = occurrences.reduce((sum, o) => sum + o.amount, 0);

    res.json({
      entries: occurrences,
      summary: {
        total: Math.round(total * 100) / 100,
        count: occurrences.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Create an entry.
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = validateEntryBody(req.body);
    if (error) return res.status(400).json({ error });

    const { rows } = await query(
      `INSERT INTO entries
         (description, amount, category_id, spent_on, is_recurring, recur_interval, recur_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        value.description,
        value.amount,
        value.category_id,
        value.spent_on,
        value.is_recurring,
        value.recur_interval,
        value.recur_until,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    next(err);
  }
});

// Update an entry.
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid entry id.' });
    const { error, value } = validateEntryBody(req.body);
    if (error) return res.status(400).json({ error });

    const { rowCount } = await query(
      `UPDATE entries SET
         description = $1, amount = $2, category_id = $3, spent_on = $4,
         is_recurring = $5, recur_interval = $6, recur_until = $7,
         updated_at = now()
       WHERE id = $8`,
      [
        value.description,
        value.amount,
        value.category_id,
        value.spent_on,
        value.is_recurring,
        value.recur_interval,
        value.recur_until,
        id,
      ]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found.' });
    res.json({ id });
  } catch (err) {
    next(err);
  }
});

// Fetch a single entry (used to populate the edit form).
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid entry id.' });
    const { rows } = await query(`${SELECT_WITH_CATEGORY} WHERE e.id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found.' });
    const r = rows[0];
    res.json({
      id: r.id,
      description: r.description,
      amount: Number(r.amount),
      category_id: r.category_id,
      spent_on: new Date(r.spent_on).toISOString().slice(0, 10),
      is_recurring: r.is_recurring,
      recur_interval: r.recur_interval,
      recur_until: r.recur_until
        ? new Date(r.recur_until).toISOString().slice(0, 10)
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// Delete an entry.
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid entry id.' });
    const { rowCount } = await query('DELETE FROM entries WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
