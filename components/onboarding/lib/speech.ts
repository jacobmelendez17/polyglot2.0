// Speech for onboarding characters, behind a small provider interface
// (spec §33: browser speech for MVP, swappable for a third-party service
// later). Synthesis goes through the app's own speech module
// (`providers/speech`) so voice selection is not implemented twice; the only
// thing added here is the promise-shaped `speak` the character bubbles need
// and support for a recorded clip when a character has one.

import { browserSpeechSynthesisProvider } from "@/providers/speech/speech-synthesis-provider";

export type SpeechProvider = {
  /** Resolves when playback ends (or fails). Never rejects. */
  speak(
    text: string,
    locale: string,
    opts?: { audioUrl?: string | null },
  ): Promise<void>;
  cancel(): void;
};

/** A safety net: some engines never fire `onend`, and a bubble must not stay up forever. */
const SPEECH_TIMEOUT_MS = 6000;

let currentAudio: HTMLAudioElement | null = null;

export const onboardingSpeech: SpeechProvider = {
  speak(text, locale, opts = {}) {
    this.cancel();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SPEECH_TIMEOUT_MS);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };

      if (opts.audioUrl) {
        const audio = new Audio(opts.audioUrl);
        currentAudio = audio;
        audio.onended = done;
        audio.onerror = done;
        audio.play().catch(done);
        return;
      }

      // Many browsers have no Tagalog voice; the bubble still shows and
      // speech is simply skipped (the provider no-ops when unsupported).
      if (!browserSpeechSynthesisProvider.isSupported()) {
        done();
        return;
      }
      browserSpeechSynthesisProvider.speak({
        text,
        languageCode: locale,
        onEnd: done,
      });
    });
  },
  cancel() {
    browserSpeechSynthesisProvider.cancel();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  },
};
