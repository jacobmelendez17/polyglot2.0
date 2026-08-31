import type {
  DashboardData,
  ForecastBucket,
  LevelProgress,
  ReviewHistoryPoint,
  StreakDay,
} from "./dashboard-types";

/**
 * Temporary development data. Structured to match `DashboardData` exactly so
 * `dashboard-service.ts` can swap this fixture for a real aggregation over
 * the `srs`, `lessons`, and `progress` domains without any change to the
 * components that consume it — see progress-tracker.md's "Next Up" list for
 * the pending Neon-backed user/progress plumbing this depends on.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function hourLabel(date: Date): string {
  const hours = date.getHours();
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}${hours < 12 ? "a" : "p"}`;
}

function buildForecast24h(now: Date, counts: [number, number][]): ForecastBucket[] {
  return counts.map(([vocabularyCount, grammarCount], index) => {
    const timestamp = new Date(now.getTime() + index * 3 * HOUR_MS);
    return {
      timestamp: timestamp.toISOString(),
      label: hourLabel(timestamp),
      vocabularyCount,
      grammarCount,
    };
  });
}

function buildForecast7d(now: Date, counts: [number, number][]): ForecastBucket[] {
  return counts.map(([vocabularyCount, grammarCount], index) => {
    const timestamp = new Date(now.getTime() + index * DAY_MS);
    return {
      timestamp: timestamp.toISOString(),
      label: WEEKDAY_LABELS[timestamp.getDay()],
      vocabularyCount,
      grammarCount,
    };
  });
}

function buildReviewHistory24h(now: Date, counts: number[]): ReviewHistoryPoint[] {
  return counts.map((completedCount, index) => {
    const timestamp = new Date(now.getTime() - (counts.length - 1 - index) * 3 * HOUR_MS);
    return { timestamp: timestamp.toISOString(), label: hourLabel(timestamp), completedCount };
  });
}

function buildReviewHistory7d(now: Date, counts: number[]): ReviewHistoryPoint[] {
  return counts.map((completedCount, index) => {
    const timestamp = new Date(now.getTime() - (counts.length - 1 - index) * DAY_MS);
    return {
      timestamp: timestamp.toISOString(),
      label: WEEKDAY_LABELS[timestamp.getDay()],
      completedCount,
    };
  });
}

function buildReviewHistory30d(now: Date, counts: number[]): ReviewHistoryPoint[] {
  return counts.map((completedCount, index) => {
    const timestamp = new Date(now.getTime() - (counts.length - 1 - index) * 3 * DAY_MS);
    return {
      timestamp: timestamp.toISOString(),
      label: `${timestamp.getMonth() + 1}/${timestamp.getDate()}`,
      completedCount,
    };
  });
}

function buildStreak(now: Date, activeDaysAgo: number[]): StreakDay[] {
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0 = Monday
  const monday = new Date(now.getTime() - dayOfWeek * DAY_MS);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getTime() + index * DAY_MS);
    const daysAgo = Math.round((now.getTime() - date.getTime()) / DAY_MS);
    return {
      date: date.toISOString().slice(0, 10),
      label: WEEKDAY_LABELS[date.getDay()],
      isActive: activeDaysAgo.includes(daysAgo),
      isToday: daysAgo === 0,
    };
  });
}

export function createPopulatedDashboardFixture(now: Date): DashboardData {
  const levelProgress: LevelProgress = {
    currentLevel: 3,
    streak: buildStreak(now, [0, 1, 2, 3, 5]),
    vocabulary: { learned: 31, total: 48 },
    grammar: { learned: 7, total: 12 },
    overall: { learned: 38, total: 60 },
  };

  return {
    lessons: { availableCount: 6 },
    reviews: { availableCount: 14, nextReviewAt: null },
    forecast: {
      "24h": buildForecast24h(now, [
        [3, 1],
        [2, 0],
        [5, 2],
        [4, 3],
        [1, 1],
        [0, 2],
        [6, 1],
        [2, 0],
      ]),
      "7d": buildForecast7d(now, [
        [12, 5],
        [8, 4],
        [15, 6],
        [10, 3],
        [9, 7],
        [4, 2],
        [11, 4],
      ]),
    },
    reviewHistory: {
      "24h": buildReviewHistory24h(now, [2, 5, 3, 8, 6, 4, 7, 3]),
      "7d": buildReviewHistory7d(now, [18, 24, 15, 30, 22, 19, 27]),
      "30d": buildReviewHistory30d(now, [
        45, 52, 38, 60, 48, 55, 42, 58, 63, 50,
      ]),
    },
    levelProgress,
  };
}

export function createNewUserDashboardFixture(now: Date): DashboardData {
  return {
    lessons: { availableCount: 6 },
    reviews: { availableCount: 0, nextReviewAt: null },
    forecast: { "24h": [], "7d": [] },
    reviewHistory: { "24h": [], "7d": [], "30d": [] },
    levelProgress: {
      currentLevel: 1,
      streak: buildStreak(now, []),
      vocabulary: { learned: 0, total: 48 },
      grammar: { learned: 0, total: 12 },
      overall: { learned: 0, total: 60 },
    },
  };
}
