const express = require('express');
const db = require('./db');
const { levelProgress, nextStreak } = require('./gamification');
const { getTotalXp, checkQuests, awardBadges } = require('./engine');
const { BADGE_CATALOG } = require('./badges');

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

    let newlyCompletedQuests = [];
    let newlyEarnedBadges = [];

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

      newlyCompletedQuests = checkQuests(db);
      newlyEarnedBadges = awardBadges(db);
    }

    const totalXp = getTotalXp(db);
    const progress = levelProgress(totalXp);

    res.json({
      action: actionRow.name,
      alreadyLoggedToday: updatedStreak.alreadyLoggedToday,
      xpAwarded: updatedStreak.alreadyLoggedToday ? 0 : actionRow.xp_value,
      streak: updatedStreak.current_streak,
      longestStreak: updatedStreak.longest_streak,
      newlyCompletedQuests,
      newlyEarnedBadges,
      ...progress,
    });
  });

  app.post('/api/quests', (req, res) => {
    const { name, targetCount, xpReward, action } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!Number.isInteger(targetCount) || targetCount <= 0) {
      return res.status(400).json({ error: 'targetCount must be a positive integer' });
    }
    if (!Number.isInteger(xpReward) || xpReward <= 0) {
      return res.status(400).json({ error: 'xpReward must be a positive integer' });
    }

    let actionId = null;
    if (action) {
      const actionRow = db.prepare('SELECT id FROM actions WHERE name = ?').get(action);
      if (!actionRow) {
        return res.status(404).json({ error: `Unknown action "${action}"` });
      }
      actionId = actionRow.id;
    }

    try {
      const info = db
        .prepare('INSERT INTO quests (name, action_id, target_count, xp_reward) VALUES (?, ?, ?, ?)')
        .run(name, actionId, targetCount, xpReward);
      res.status(201).json({ id: info.lastInsertRowid, name, action: action || null, targetCount, xpReward });
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: `Quest "${name}" already exists` });
      }
      throw err;
    }
  });

  app.get('/api/quests', (req, res) => {
    const quests = db
      .prepare(
        `SELECT q.id, q.name, q.action_id AS actionId, a.name AS action,
                q.target_count AS targetCount, q.xp_reward AS xpReward,
                q.created_at AS createdAt, q.completed_at AS completedAt
         FROM quests q LEFT JOIN actions a ON a.id = q.action_id
         ORDER BY q.created_at DESC`
      )
      .all();

    const withProgress = quests.map(({ actionId, ...quest }) => {
      const { count } = db
        .prepare(
          `SELECT COUNT(*) AS count FROM logs
           WHERE completed_date >= substr(@createdAt, 1, 10)
           AND (@actionId IS NULL OR action_id = @actionId)`
        )
        .get({ createdAt: quest.createdAt, actionId });

      return { ...quest, progress: Math.min(count, quest.targetCount), completed: quest.completedAt !== null };
    });

    res.json({ quests: withProgress });
  });

  app.get('/api/badges', (req, res) => {
    const earned = new Map(
      db.prepare('SELECT badge_id, earned_at FROM earned_badges').all().map((r) => [r.badge_id, r.earned_at])
    );

    const badges = BADGE_CATALOG.map(({ check, ...badge }) => ({
      ...badge,
      earned: earned.has(badge.id),
      earnedAt: earned.get(badge.id) || null,
    }));

    res.json({ badges });
  });

  app.get('/api/stats', (req, res) => {
    const totalXp = getTotalXp(db);
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
