/**
 * Client-safe public surface for `domains/practice`: types and pure,
 * database-free helpers only. Everything that touches the database lives in
 * `./server.ts` (see that file for why).
 */
export {
  PRACTICE_ACTIVITY_WINDOW_DAYS,
  PRACTICE_SKILL_DEFINITIONS,
} from "./practice-catalog";
export {
  PRACTICE_ACTIVITY_DOT_COUNT,
  buildPracticeHubView,
  countLitActivityDots,
  filterGroves,
  parsePracticeSkillFilter,
} from "./practice-hub-view";
export { PRACTICE_SKILLS, PRACTICE_TYPES } from "./practice-types";
export type {
  PracticeCardView,
  PracticeFeatureView,
  PracticeGroveView,
  PracticeHubView,
  PracticeSkill,
  PracticeSkillFilter,
  PracticeType,
  PracticeTypeActivity,
  PracticeWalkStepView,
  PracticeWalkView,
} from "./practice-types";
