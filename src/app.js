const express = require('express');
const db = require('./db');
const { levelProgress, nextStreak } = require('./gamification');

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) {
    return res.status(500).json({ error: 'Server misconfigured: API_KEY not set' });
  }
  if (req.get('x-api-key') !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', requireApiKey);

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.post('/api/actions', (req, res) => {
    const { name, xpValue } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!Number.isInteger(xpValue) || xpValue <= 0) {
      return res.status(400).json({ error: 'xpValue must be a positive integer' });
    }

    try {
      const info = db
        .prepare('INSERT INTO actions (name, xp_value) VALUES (?, ?)')
        .run(name, xpValue);
      res.status(201).json({ id: info.lastInsertRowid, name, xpValue });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: `Action "${name}" already exists` });
      }
      throw err;
    }
  });

  app.get('/api/actions', (req, res) => {
    const actions = db.prepare('SELECT id, name, xp_value AS xpValue FROM actions ORDER BY name').all();
    res.json({ actions });
  });

  app.post('/api/log', (req, res) => {
    const { action, date } = req.body || {};
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'action is required' });
    }

    const actionRow = db.prepare('SELECT * FROM actions WHERE name = ?').get(action);
    if (!actionRow) {
      return res.status(404).json({ error: `Unknown action "${action}"` });
    }

    const completedDate = date || todayString();
    const streakRow = db.prepare('SELECT * FROM streaks WHERE action_id = ?').get(actionRow.id);
    const updatedStreak = nextStreak(streakRow, completedDate);

    if (!updatedStreak.alreadyLoggedToday) {
      db.prepare(
        'INSERT INTO logs (action_id, xp_awarded, completed_date) VALUES (?, ?, ?)'
      ).run(actionRow.id, actionRow.xp_value, completedDate);

      db.prepare(
        `INSERT INTO streaks (action_id, current_streak, longest_streak, last_completed_date)
         VALUES (@action_id, @current_streak, @longest_streak, @last_completed_date)
         ON CONFLICT(action_id) DO UPDATE SET
           current_streak = excluded.current_streak,
           longest_streak = excluded.longest_streak,
           last_completed_date = excluded.last_completed_date`
      ).run({ action_id: actionRow.id, ...updatedStreak });
    }

    const totalXp = db.prepare('SELECT COALESCE(SUM(xp_awarded), 0) AS total FROM logs').get().total;
    const progress = levelProgress(totalXp);

    res.json({
      action: actionRow.name,
      alreadyLoggedToday: updatedStreak.alreadyLoggedToday,
      xpAwarded: updatedStreak.alreadyLoggedToday ? 0 : actionRow.xp_value,
      streak: updatedStreak.current_streak,
      longestStreak: updatedStreak.longest_streak,
      ...progress,
    });
  });

  app.get('/api/stats', (req, res) => {
    const totalXp = db.prepare('SELECT COALESCE(SUM(xp_awarded), 0) AS total FROM logs').get().total;
    const progress = levelProgress(totalXp);

    const actions = db
      .prepare(
        `SELECT a.name AS name, s.current_streak AS streak, s.longest_streak AS longestStreak,
                s.last_completed_date AS lastCompleted
         FROM actions a
         LEFT JOIN streaks s ON s.action_id = a.id
         ORDER BY a.name`
      )
      .all();

    res.json({ ...progress, actions });
  });

  return app;
}

module.exports = createApp;
