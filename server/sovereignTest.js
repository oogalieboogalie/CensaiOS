import express from 'express';
import pool from './db.js';

export const sovereignTestRouter = express.Router();

// GET all records from agents
sovereignTestRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agents ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    // Fallback if created_at does not exist on the table
    try {
      const result = await pool.query('SELECT * FROM agents LIMIT 100');
      res.json(result.rows);
    } catch (fallbackErr) {
      console.error('Error fetching from agents:', fallbackErr.message);
      res.status(500).json({ error: fallbackErr.message });
    }
  }
});

// POST a new record to agents
sovereignTestRouter.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing field: name' });
  }
  try {
    // Attempt standard insert with ID for tables like 'agents'
    const id = 'test_' + Math.random().toString(36).substring(2, 10);
    const result = await pool.query(
      'INSERT INTO agents (id, name, role) VALUES ($1, $2, $3) RETURNING *',
      [id, name, 'Scaffolded Role']
    );
    res.json(result.rows[0]);
  } catch (err) {
    // Fallback simple insert if the schema differs
    try {
      const result = await pool.query(
        'INSERT INTO agents (name) VALUES ($1) RETURNING *',
        [name]
      );
      res.json(result.rows[0]);
    } catch (fallbackErr) {
      console.error('Error inserting into agents:', fallbackErr.message);
      res.status(500).json({ error: fallbackErr.message });
    }
  }
});
