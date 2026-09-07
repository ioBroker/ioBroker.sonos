// Loaded by the host before the components themselves and merged into its own dictionary, so the
// keys have to be unique across all adapters - hence the `sonosdm_` prefix.
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

const translations = {
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

export default translations;
