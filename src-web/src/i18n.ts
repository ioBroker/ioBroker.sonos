// Translations of the web page. The wording of the shared keys is taken from the vis-2 widget set,
// so the same thing is called the same in both UIs.

import en from './i18n/en.json';
import de from './i18n/de.json';
import ru from './i18n/ru.json';
import pt from './i18n/pt.json';
import nl from './i18n/nl.json';
import fr from './i18n/fr.json';
import it from './i18n/it.json';
import es from './i18n/es.json';
import pl from './i18n/pl.json';
import uk from './i18n/uk.json';
import zhCn from './i18n/zh-cn.json';

const translations: Record<string, Record<string, string>> = {
    en,
    de,
    ru,
    pt,
    nl,
    fr,
    it,
    es,
    pl,
    uk,
    'zh-cn': zhCn,
};

let language: ioBroker.Languages = 'en';

/**
 * The language of the page.
 *
 * ioBroker's system language wins; it is read once the socket is up. Until then - and when the
 * system uses a language this page does not know - the browser language decides.
 */
export function setLanguage(lang: string | undefined): void {
    const wanted = (lang || '').toLowerCase();
    if (translations[wanted]) {
        language = wanted as ioBroker.Languages;
        return;
    }
    // `de-DE` and the like
    const short = wanted.split('-')[0];
    if (translations[short]) {
        language = short as ioBroker.Languages;
    }
}

export function getLanguage(): ioBroker.Languages {
    return language;
}

/** Translate a key; unknown keys fall back to English and then to the key itself. */
export function t(key: string): string {
    return translations[language]?.[key] || translations.en[key] || key;
}

/** `common.name` may be a plain string or a translation object. */
export function translated(text: ioBroker.StringOrTranslated | undefined): string {
    if (!text) {
        return '';
    }
    if (typeof text === 'string') {
        return text;
    }
    return text[language] || text.en || '';
}

setLanguage(globalThis.navigator?.language);
