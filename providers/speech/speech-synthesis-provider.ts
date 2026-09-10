import { baseLanguageSubtag } from "@/lib/language-code";

/**
 * Pronunciation playback, behind a provider interface.
 *
 * Spec 18 asks the item page to "reuse the existing audio/speech system".
 * There was none: nothing in this codebase played audio, the `media` domain
 * and its R2 bucket are unbuilt, and `architecture.md`'s speech provider
 * covers *recognition* (speaking practice), not synthesis. The user's
 * decision (2026-09-09) was to use the browser's built-in speech synthesis
 * now, structured so imported pronunciation audio replaces it later.
 *
 * So this is deliberately narrow: it is the fallback voice, not an audio
 * system. A component prefers a real recording whenever the item has one
 * (`ItemDetailPronunciationView.audioUrl`) and only reaches for synthesis
 * when it does not — which is every item today.
 *
 * Browser-only. `window.speechSynthesis` does not exist during SSR, and a
 * component must check {@link isSpeechSynthesisSupported} before offering
 * the control rather than rendering a button that silently does nothing.
 */
export interface SpeechSynthesisProvider {
  isSupported(): boolean;
  /** Speaks `text` in `languageCode`, cancelling anything already speaking. */
  speak(input: { text: string; languageCode: string; onEnd?: () => void }): void;
  cancel(): void;
}

function getSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

/**
 * Picks the closest available voice for a language code, preferring an exact
 * regional match (`es-MX`) over the bare language (`es`).
 *
 * Returning `null` is normal and fine: with no explicit voice the browser
 * picks one from `utterance.lang` itself. Voices also load asynchronously in
 * several browsers, so an early call legitimately sees an empty list.
 */
function findVoice(synthesis: SpeechSynthesis, languageCode: string): SpeechSynthesisVoice | null {
  const voices = synthesis.getVoices();
  if (voices.length === 0) return null;

  const normalized = languageCode.toLowerCase();
  const base = baseLanguageSubtag(languageCode);

  return (
    voices.find((voice) => voice.lang.toLowerCase() === normalized) ??
    voices.find((voice) => baseLanguageSubtag(voice.lang) === base) ??
    null
  );
}

export const browserSpeechSynthesisProvider: SpeechSynthesisProvider = {
  isSupported(): boolean {
    return getSynthesis() !== null;
  },

  speak({ text, languageCode, onEnd }): void {
    const synthesis = getSynthesis();
    if (!synthesis) return;

    // Cancel first: pressing two pronunciation buttons in a row should
    // replace the utterance, not queue a second one behind it.
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageCode;
    const voice = findVoice(synthesis, languageCode);
    if (voice) utterance.voice = voice;
    // Slightly slower than default: this is a learner hearing a word for the
    // first time, not a screen reader reading prose.
    utterance.rate = 0.9;
    if (onEnd) {
      utterance.onend = () => onEnd();
      utterance.onerror = () => onEnd();
    }

    synthesis.speak(utterance);
  },

  cancel(): void {
    getSynthesis()?.cancel();
  },
};
