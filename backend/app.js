const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); 

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Optional DB: app works without DB if vars are missing
let pool = null;
if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME && process.env.DB_PASSWORD) {
  pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
}

// Ensure schema if DB available
async function ensureSchema() {
  if (!pool) return;
  const sql = `
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT
    );
  `;
  await pool.query(sql);
  console.log('ensureSchema: tasks table is present');
}

app.get('/', (req, res) => {
  res.status(200).send('API is running');
});

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, db: !!pool });
});

// CRUD routes use DB if configured; otherwise return 501
app.post('/tasks', async (req, res) => {
  if (!pool) return res.status(501).json({ error: 'DB not configured' });
  const { title, description } = req.body || {};
  try {
    const r = await pool.query(
      'INSERT INTO tasks (title, description) VALUES ($1, $2) RETURNING *',
      [title, description]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/tasks', async (_req, res) => {
  if (!pool) return res.status(501).json({ error: 'DB not configured' });
  try {
    const r = await pool.query('SELECT * FROM tasks ORDER BY id ASC');
    res.json(r.rows);
  } catch (err) {
    console.error('error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/tasks/:id', async (req, res) => {
  if (!pool) return res.status(501).json({ error: 'DB not configured' });
  try {
    const r = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/tasks/:id', async (req, res) => {
  if (!pool) return res.status(501).json({ error: 'DB not configured' });
  const { title, description } = req.body || {};
  try {
    const r = await pool.query(
      'UPDATE tasks SET title=$1, description=$2 WHERE id=$3 RETURNING *',
      [title, description, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error('error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/tasks/:id', async (req, res) => {
  if (!pool) return res.status(501).json({ error: 'DB not configured' });
  try {
    const r = await pool.query('DELETE FROM tasks WHERE id=$1 RETURNING *', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

(async () => {
  try {
    await ensureSchema();
    app.listen(port, () => {
      console.log(`Server listening on ${port}`);
    });
  } catch (err) {
    console.error('error', err);
    process.exit(1);
  }
})();
