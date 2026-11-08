const moment = require('moment-timezone');
const { evaluateISTStreak } = require('../../src/models/Leaderboard');

describe('evaluateISTStreak - IST Midnight Boundary Calculation', () => {
  const IST_TZ = 'Asia/Kolkata';

  it('initializes streak to 1 for first completion ever', () => {
    const user = { gamification: { dailyStreak: 0, streakShields: 0 } };
    const result = evaluateISTStreak(user, null);

    expect(result.streak).toBe(1);
    expect(result.streakMaintained).toBe(true);
  });

  it('preserves streak without increment if already completed today in IST', () => {
    const nowIST = moment().tz(IST_TZ);
    const lastCompletedAt = nowIST.toDate();
    const user = { gamification: { dailyStreak: 7, streakShields: 2 } };

    const result = evaluateISTStreak(user, lastCompletedAt);

    expect(result.streak).toBe(7);
    expect(result.streakMaintained).toBe(true);
  });

  it('increments streak if completed yesterday in IST', () => {
    const yesterdayIST = moment().tz(IST_TZ).subtract(1, 'day');
    const lastCompletedAt = yesterdayIST.toDate();
    const user = { gamification: { dailyStreak: 5, streakShields: 1 } };

    const result = evaluateISTStreak(user, lastCompletedAt);

    expect(result.streak).toBe(6);
    expect(result.streakMaintained).toBe(true);
  });

  it('consumes streak shield when missing a day with shields available', () => {
    const twoDaysAgoIST = moment().tz(IST_TZ).subtract(2, 'days');
    const lastCompletedAt = twoDaysAgoIST.toDate();
    const user = { gamification: { dailyStreak: 12, streakShields: 2 } };

    const result = evaluateISTStreak(user, lastCompletedAt);

    expect(result.streak).toBe(12);
    expect(result.shieldConsumed).toBe(true);
    expect(result.streakMaintained).toBe(true);
    expect(user.gamification.streakShields).toBe(1);
  });

  it('resets streak to 1 when missing a day with 0 streak shields', () => {
    const threeDaysAgoIST = moment().tz(IST_TZ).subtract(3, 'days');
    const lastCompletedAt = threeDaysAgoIST.toDate();
    const user = { gamification: { dailyStreak: 15, streakShields: 0 } };

    const result = evaluateISTStreak(user, lastCompletedAt);

    expect(result.streak).toBe(1);
    expect(result.streakMaintained).toBe(false);
  });

  it('correctly transitions across midnight IST', () => {
    const nowIST = moment().tz(IST_TZ);
    const yesterday2359IST = nowIST.clone().subtract(1, 'day').hour(23).minute(59).second(50);
    const user = { gamification: { dailyStreak: 3, streakShields: 0 } };

    const result = evaluateISTStreak(user, yesterday2359IST.toDate());

    expect(result.streak).toBe(4);
    expect(result.streakMaintained).toBe(true);
  });
});
