const XP_PER_LEVEL_STEP = 100;

// Cumulative XP required to reach `level` (level 1 = 0 XP).
// Each level requires XP_PER_LEVEL_STEP * previousLevel more than the last,
// so the climb gets steeper as you level up.
function xpForLevel(level) {
  return (XP_PER_LEVEL_STEP * (level - 1) * level) / 2;
}

function levelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) {
    level += 1;
  }
  return level;
}

function levelProgress(totalXp) {
  const level = levelFromXp(totalXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return {
    level,
    totalXp,
    xpIntoLevel: totalXp - currentLevelXp,
    xpForNextLevel: nextLevelXp - currentLevelXp,
  };
}

function dayBefore(dateString) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Given the streak row (or undefined) and today's date, compute the updated
// streak after a completion on `today`.
function nextStreak(streakRow, today) {
  if (!streakRow || !streakRow.last_completed_date) {
    return { current_streak: 1, longest_streak: 1, last_completed_date: today, alreadyLoggedToday: false };
  }

  if (streakRow.last_completed_date === today) {
    return { ...streakRow, alreadyLoggedToday: true };
  }

  const isConsecutive = streakRow.last_completed_date === dayBefore(today);
  const current = isConsecutive ? streakRow.current_streak + 1 : 1;
  const longest = Math.max(current, streakRow.longest_streak);

  return {
    current_streak: current,
    longest_streak: longest,
    last_completed_date: today,
    alreadyLoggedToday: false,
  };
}

module.exports = { xpForLevel, levelFromXp, levelProgress, nextStreak, dayBefore };
