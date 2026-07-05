const BADGE_CATALOG = [
  {
    id: 'first_step',
    name: 'First Step',
    description: 'Log your first habit completion',
    xpReward: 10,
    check: (s) => s.totalCompletions >= 1,
  },
  {
    id: 'streak_3',
    name: 'On a Roll',
    description: 'Reach a 3-day streak on any habit',
    xpReward: 15,
    check: (s) => s.bestStreak >= 3,
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Reach a 7-day streak on any habit',
    xpReward: 30,
    check: (s) => s.bestStreak >= 7,
  },
  {
    id: 'streak_30',
    name: 'Unstoppable',
    description: 'Reach a 30-day streak on any habit',
    xpReward: 100,
    check: (s) => s.bestStreak >= 30,
  },
  {
    id: 'level_5',
    name: 'Rising Star',
    description: 'Reach level 5',
    xpReward: 25,
    check: (s) => s.level >= 5,
  },
  {
    id: 'level_10',
    name: 'Veteran',
    description: 'Reach level 10',
    xpReward: 50,
    check: (s) => s.level >= 10,
  },
  {
    id: 'half_century',
    name: 'Half Century',
    description: 'Log 50 total habit completions',
    xpReward: 40,
    check: (s) => s.totalCompletions >= 50,
  },
  {
    id: 'centurion',
    name: 'Centurion',
    description: 'Log 100 total habit completions',
    xpReward: 75,
    check: (s) => s.totalCompletions >= 100,
  },
];

module.exports = { BADGE_CATALOG };
