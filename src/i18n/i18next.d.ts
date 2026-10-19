import type en from "@/locales/en.json";

// Type-checks t("…") keys against the English messages.
declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "translation";
		resources: { translation: typeof en };
	}
}
