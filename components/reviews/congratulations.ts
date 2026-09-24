/**
 * "Congratulations" in the language being learned, keyed by the primary
 * subtag of `languages.code` (`es-MX` → `es`). Falls back to English for a
 * language not listed here rather than guessing a translation.
 */
const CONGRATULATIONS: Record<string, string> = {
  es: "¡Felicidades!",
  fr: "Félicitations !",
  de: "Glückwunsch!",
  it: "Congratulazioni!",
  pt: "Parabéns!",
  nl: "Gefeliciteerd!",
  ja: "おめでとう！",
  ko: "축하합니다!",
  zh: "恭喜！",
  ru: "Поздравляем!",
  ar: "تهانينا!",
  hi: "बधाई हो!",
  tr: "Tebrikler!",
  pl: "Gratulacje!",
  sv: "Grattis!",
};

export function congratulationsFor(languageCode: string): string {
  const primary = languageCode.split("-")[0]?.toLowerCase() ?? "";
  return CONGRATULATIONS[primary] ?? "Congratulations!";
}
