import type { Dictionary, WordKey } from './texts';

/** The words of the components by language, picked by `vite.config.ts` from the i18n files of the adapter */
declare const __SONOS_WORDS__: Record<string, Partial<Dictionary>>;

/** Named once only: `define` puts the whole table in at every place that names it */
const WORDS = __SONOS_WORDS__;

/** A word in the language of the system */
export type Word = (key: WordKey) => string;

/**
 * The words in one language; a word missing in it is taken in English
 *
 * @param lang the language of the ioBroker system
 */
export function getWords(lang: string): Word {
    const words = WORDS[lang] || {};
    const en = WORDS.en || {};
    return key => words[key] || en[key] || key;
}
