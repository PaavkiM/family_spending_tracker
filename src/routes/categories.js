import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// List all categories.
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, color FROM categories ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Create a category.
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const color = String(req.body.color || '#6366f1').trim();

    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (name.length > 60) {
      return res.status(400).json({ error: 'Name is too long (max 60).' });
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return res.status(400).json({ error: 'Color must be a hex like #6366f1.' });
    }

    const { rows } = await query(
      `INSERT INTO categories (name, color) VALUES ($1, $2)
       RETURNING id, name, color`,
      [name, color]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That category already exists.' });
    }
    next(err);
  }
});

// Update a category.
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body.name || '').trim();
    const color = String(req.body.color || '').trim();

    if (!name) return res.status(400).json({ error: 'Name is required.' });
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return res.status(400).json({ error: 'Color must be a hex like #6366f1.' });
    }

    const { rows } = await query(
      `UPDATE categories SET name = $1, color = COALESCE(NULLIF($2,''), color)
       WHERE id = $3 RETURNING id, name, color`,
      [name, color, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found.' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That category already exists.' });
    }
    next(err);
  }
});

// Delete a category. Entries keep their history but lose the link (SET NULL).
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rowCount } = await query('DELETE FROM categories WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
