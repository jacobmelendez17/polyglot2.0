// Content for onboarding slides 2 and 4. Data only — safe to edit without
// touching any animation code.

export type Tone = "pink" | "gold" | "accent";

export type OnboardingCharacter = {
  key: "tagalog" | "spanish" | "french";
  name: string;
  /** BCP-47 locale used for speech. */
  locale: string;
  phrase: string;
  translation: string;
  /**
   * Character art. null = dashed placeholder.
   * Suggested location: public/onboarding/characters/<key>.png → "/onboarding/characters/<key>.png"
   */
  image: string | null;
  /** Optional recorded audio; when set it plays instead of browser speech. */
  audioUrl: string | null;
  tone: Tone;
};

export const ONBOARDING_CAST: OnboardingCharacter[] = [
  {
    key: "tagalog",
    name: "Tagalog",
    locale: "tl-PH",
    phrase: "Kumusta! Tara, mag-aral tayo!",
    translation: "Hi! Let’s study!",
    image: null,
    audioUrl: null,
    tone: "pink",
  },
  {
    key: "spanish",
    name: "Español",
    locale: "es-MX",
    phrase: "¡Hola! Vamos a aprender juntos.",
    translation: "Hi! Let’s learn together.",
    image: null,
    audioUrl: null,
    tone: "gold",
  },
  {
    key: "french",
    name: "Français",
    locale: "fr-FR",
    phrase: "Bonjour ! Apprenons ensemble.",
    translation: "Hello! Let’s learn together.",
    image: null,
    audioUrl: null,
    tone: "accent",
  },
];

export type Motif = "sun" | "waves" | "flowers" | "stars" | "trees" | "kites";

export type Postcard = {
  lang: string;
  text: string;
  /** Artwork colours. Postcards are illustrations, so these are fixed in both themes. */
  bg: string;
  a: string;
  b: string;
  c: string;
  motif: Motif;
  /** Absolute position inside the slide (CSS). */
  pos: { left?: string; right?: string; top?: string; bottom?: string };
  /** Resting tilt in degrees. */
  rot: number;
};

// Order matters: on narrow screens only the first four are shown.
export const POSTCARDS: Postcard[] = [
  {
    lang: "Español",
    text: "¡Diviértete!",
    bg: "#E4572E",
    a: "#F7C548",
    b: "#2E8B7A",
    c: "#FFF4E0",
    motif: "sun",
    pos: { left: "3%", top: "7%" },
    rot: -8,
  },
  {
    lang: "Tagalog",
    text: "Magsaya ka!",
    bg: "#2D6CB5",
    a: "#F6D55C",
    b: "#ED8A63",
    c: "#FFFFFF",
    motif: "waves",
    pos: { right: "3%", top: "6%" },
    rot: 7,
  },
  {
    lang: "Français",
    text: "Amuse-toi bien !",
    bg: "#F2A7B8",
    a: "#D6336C",
    b: "#3C8D5B",
    c: "#FFF8F0",
    motif: "flowers",
    pos: { left: "5%", top: "40%" },
    rot: 5,
  },
  {
    lang: "日本語",
    text: "楽しんでね！",
    bg: "#2B3A67",
    a: "#FFD166",
    b: "#EF476F",
    c: "#FFFFFF",
    motif: "stars",
    pos: { right: "5%", top: "39%" },
    rot: -6,
  },
  {
    lang: "Italiano",
    text: "Divertiti!",
    bg: "#7BC47F",
    a: "#F4A259",
    b: "#2F5D50",
    c: "#FFF6E5",
    motif: "trees",
    pos: { left: "2%", bottom: "17%" },
    rot: -4,
  },
  {
    lang: "Português",
    text: "Divirta-se!",
    bg: "#F6C445",
    a: "#E4572E",
    b: "#1F7A8C",
    c: "#FFFFFF",
    motif: "kites",
    pos: { right: "2%", bottom: "17%" },
    rot: 4,
  },
  {
    lang: "Deutsch",
    text: "Viel Spaß!",
    bg: "#8E6FC7",
    a: "#FFD6A5",
    b: "#F25F5C",
    c: "#FFFFFF",
    motif: "sun",
    pos: { left: "23%", top: "3%" },
    rot: 3,
  },
  {
    lang: "Kiswahili",
    text: "Furahia!",
    bg: "#1F9E89",
    a: "#FDE74C",
    b: "#E4572E",
    c: "#FFFFFF",
    motif: "flowers",
    pos: { right: "23%", top: "4%" },
    rot: -3,
  },
  {
    lang: "हिन्दी",
    text: "मज़े करो!",
    bg: "#F28C38",
    a: "#FFF1C1",
    b: "#8E3B8A",
    c: "#FFFFFF",
    motif: "trees",
    pos: { left: "17%", top: "60%" },
    rot: 6,
  },
  {
    lang: "Nederlands",
    text: "Veel plezier!",
    bg: "#6FB7E0",
    a: "#FFD23F",
    b: "#E4572E",
    c: "#FFFFFF",
    motif: "waves",
    pos: { right: "17%", top: "60%" },
    rot: -5,
  },
];

/** Copy for the four slides, verbatim from the approved prototype. */
export const SLIDE_COPY = {
  foundation: {
    kicker: "Step 1 · Spaced repetition",
    title: "Establish a foundation",
    body: "Using a Spaced Repetition system, build a foundation of vocabulary and grammar where reviews are scheduled right before your brain forgets the word.",
  },
  immerse: {
    hint: "Tap a character to hear them",
    title: "Immerse yourself",
    body: "Learn all the aspects of a language with listening, speaking, reading, and many other practices all in one place to start using your skills in the real world.",
  },
  customize: {
    kicker: "Step 3 · Your way",
    title: "Customization",
    body: "What makes us different is the flexibility to learn at your pace and preference. Choose the perfect structure of learning whether that’s theme, curriculum style, and so much more.",
  },
  fun: {
    kicker: "¡Diviértete!",
    title: "Have fun!",
    body: "Your first lessons are ready. Tap a postcard to flip it.",
    cta: "Start learning",
  },
} as const;
