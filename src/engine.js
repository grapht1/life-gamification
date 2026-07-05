const { levelFromXp } = require('./gamification');
const { BADGE_CATALOG } = require('./badges');

function getTotalXp(db) {
  const logsXp = db.prepare('SELECT COALESCE(SUM(xp_awarded), 0) AS t FROM logs').get().t;
  const bonusXp = db.prepare('SELECT COALESCE(SUM(xp), 0) AS t FROM bonus_xp').get().t;
  return logsXp + bonusXp;
}

// Completes any open quest whose target has been reached and awards its
// bonus XP. Returns the quests newly completed by this call.
function checkQuests(db) {
  const openQuests = db.prepare('SELECT * FROM quests WHERE completed_at IS NULL').all();
  const completed = [];

  for (const quest of openQuests) {
    const { count } = db
      .prepare(
        `SELECT COUNT(*) AS count FROM logs
         WHERE completed_date >= substr(@createdAt, 1, 10)
         AND (@actionId IS NULL OR action_id = @actionId)`
      )
      .get({ createdAt: quest.created_at, actionId: quest.action_id });

    if (count >= quest.target_count) {
      const now = new Date().toISOString();
      db.prepare('UPDATE quests SET completed_at = ? WHERE id = ?').run(now, quest.id);
      db.prepare('INSERT INTO bonus_xp (source, xp) VALUES (?, ?)').run(`quest:${quest.id}`, quest.xp_reward);
      completed.push({ id: quest.id, name: quest.name, xpReward: quest.xp_reward });
    }
  }

  return completed;
}

// Awards any badges whose criteria are newly met and grants their bonus XP.
// Returns the badges newly earned by this call.
function awardBadges(db) {
  const totalCompletions = db.prepare('SELECT COUNT(*) AS c FROM logs').get().c;
  const bestStreak = db.prepare('SELECT COALESCE(MAX(current_streak), 0) AS m FROM streaks').get().m;
  const stats = { totalCompletions, bestStreak, level: levelFromXp(getTotalXp(db)) };

  const earnedIds = new Set(db.prepare('SELECT badge_id FROM earned_badges').all().map((r) => r.badge_id));
  const newlyEarned = [];

  for (const badge of BADGE_CATALOG) {
    if (earnedIds.has(badge.id)) continue;
    if (!badge.check(stats)) continue;

    db.prepare('INSERT INTO earned_badges (badge_id) VALUES (?)').run(badge.id);
    db.prepare('INSERT INTO bonus_xp (source, xp) VALUES (?, ?)').run(`badge:${badge.id}`, badge.xpReward);
    newlyEarned.push({ id: badge.id, name: badge.name, description: badge.description, xpReward: badge.xpReward });
  }

  return newlyEarned;
}

module.exports = { getTotalXp, checkQuests, awardBadges };
