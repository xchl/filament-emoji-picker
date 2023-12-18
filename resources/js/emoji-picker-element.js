import { Picker } from 'emoji-picker-element';
import { PopupElement } from 'inclusive-elements';
import ar from 'emoji-picker-element/i18n/ar';
import de from 'emoji-picker-element/i18n/de';
import en from 'emoji-picker-element/i18n/en';
import es from 'emoji-picker-element/i18n/es';
import fr from 'emoji-picker-element/i18n/fr';
import hi from 'emoji-picker-element/i18n/hi';
import id from 'emoji-picker-element/i18n/id';
import it from 'emoji-picker-element/i18n/it';
import ms_MY from 'emoji-picker-element/i18n/ms_MY';
import nl from 'emoji-picker-element/i18n/nl';
import pt_BR from 'emoji-picker-element/i18n/pt_BR';
import pt_PT from 'emoji-picker-element/i18n/pt_PT';
import ru_RU from 'emoji-picker-element/i18n/ru_RU';
import tr from 'emoji-picker-element/i18n/tr';
import zh_CN from 'emoji-picker-element/i18n/zh_CN';




window.customElements.define('ui-popup', PopupElement);



export default function emojiPickerElement({state,locale}){
    let i18n=en,l='en';
    switch (locale) {
        case 'ar':
            i18n=ar;
            l='ar';
            break;
        case 'de':
            i18n=de;
            l='de';
            break;
        case 'en':
            i18n=en;
            l='en';
            break;
        case 'es':
            i18n=es;
            l='es';
            break;
        case 'fr':
            i18n=fr;
            l='fr';
            break;
        case 'hi':
            i18n=hi;
            l='hi';
            break;
        case 'id':
            i18n=id;
            l='id';
            break;
        case 'it':
            i18n=it;
            l='it';
            break;
        case 'ms_MY':
            i18n=ms_MY;
            l='ms_MY';
            break;
        case 'nl':
            i18n=nl;
            l='nl';
            break;
        case 'pt_BR':
            i18n=pt_BR;
            l='pt_BR';
            break;
        case 'pt_PT':
            i18n=pt_PT;
            l='pt_PT';
            break;
        case 'ru_RU':
            i18n=ru_RU;
            l='ru_RU';
            break;
        case 'tr':
            i18n=tr;
            l='tr';
            break;
        case 'zh_CN':
            i18n=zh_CN;
            l='zh_CN';
            break;
        default:
            i18n=en;
            l='en';
            break;
    }
    return {
        state,
        init() {
            const emojiPicker = new Picker({
                emojiVersion: 15.0,
                locale : l,
                i18n : i18n,
            });
            this.$refs.picker.appendChild(emojiPicker)
        }
    }
}
