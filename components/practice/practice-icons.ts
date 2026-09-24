import {
  BookOpenText,
  FileCheck,
  Headphones,
  MessageSquareText,
  Mic,
  NotebookPen,
  PenLine,
  Repeat,
  type LucideIcon,
} from "lucide-react";

import type {
  PracticeFeatureView,
  PracticeSkill,
  PracticeType,
} from "@/domains/practice";

/** Icons live with the components, not the domain: `domains/practice` must stay free of React. */
export const PRACTICE_SKILL_ICONS: Record<PracticeSkill, LucideIcon> = {
  listening: Headphones,
  speaking: Mic,
  reading: BookOpenText,
  writing: PenLine,
};

export const PRACTICE_TYPE_ICONS: Record<PracticeType, LucideIcon> = {
  listening: Headphones,
  speaking: Mic,
  stories: BookOpenText,
  sentences: MessageSquareText,
  journal: NotebookPen,
  conjugation: Repeat,
};

export const PRACTICE_FEATURE_ICONS: Record<
  PracticeFeatureView["id"],
  LucideIcon
> = {
  tests: FileCheck,
  conjugation: Repeat,
};
