import bn from "@/locales/bn.json";
import de from "@/locales/de.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import hi from "@/locales/hi.json";
import it from "@/locales/it.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";
import ptBR from "@/locales/pt-BR.json";
import ru from "@/locales/ru.json";
import tr from "@/locales/tr.json";
import zhCN from "@/locales/zh-CN.json";

import type { Language } from "./languages";

// Not `typeof en`: plural forms differ by language (ja has only `_other`, ru adds `_few`/`_many`).
export interface Messages {
	[key: string]: string | Messages;
}

// Server-only: every language's messages. The client is handed just the one it renders.
export const messages: Record<Language, Messages> = {
	en,
	"zh-CN": zhCN,
	es,
	hi,
	"pt-BR": ptBR,
	bn,
	ru,
	ja,
	fr,
	de,
	ko,
	tr,
	it,
};
