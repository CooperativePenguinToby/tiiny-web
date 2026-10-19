import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./helpers";

// Oracle: the locale files themselves, read from disk rather than through the app.
type Messages = { nav: Record<string, string>; titles: Record<string, string>; errors: Record<string, string> };
const LOCALES = path.join(process.cwd(), "src", "locales");
const messages = (code: string): Messages =>
	JSON.parse(readFileSync(path.join(LOCALES, `${code}.json`), "utf8")) as Messages;

const en = messages("en");
const ja = messages("ja");
const de = messages("de");

// The {{name}} interpolation i18next does, for the few strings checked here.
const fill = (template: string, values: Record<string, string>): string =>
	template.replaceAll(/\{\{(\w+)\}\}/g, (_match, name: string) => values[name] ?? "");

const pageTitle = (m: Messages, page: string): string => fill(m.titles.page, { page: m.titles[page]!, site: "Tiiny" });

async function expectNav(page: Page, m: Messages): Promise<void> {
	const nav = page.locator("nav").first();
	for (const key of ["overview", "models", "agents", "chat", "playground", "vault", "connectors", "settings"]) {
		await expect(nav.getByText(m.nav[key]!, { exact: true })).toBeVisible();
	}
	await expect(page.getByRole("button", { name: m.nav.signOut, exact: true })).toBeVisible();
}

test.describe("browser language", () => {
	test.use({ locale: "de-DE" });

	test("a German browser gets German without choosing anything", async ({ page }) => {
		expect(de.titles.signIn).not.toBe(en.titles.signIn);
		await page.goto("/auth/sign-in");
		await expect(page.locator("html")).toHaveAttribute("lang", "de");
		await expect(page).toHaveTitle(pageTitle(de, "signIn"));
	});
});

test.describe("unsupported browser language", () => {
	test.use({ locale: "sw-KE" });

	test("falls back to English", async ({ page }) => {
		await page.goto("/auth/sign-in");
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await expect(page).toHaveTitle(pageTitle(en, "signIn"));
	});
});

test("the top-bar choice switches the whole UI, survives a reload, and localizes server errors", async ({ page }) => {
	expect(ja.nav.models).not.toBe(en.nav.models);
	await signIn(page);
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expectNav(page, en);

	await page.getByRole("button", { name: fill(en.nav.languageCurrent, { language: "English" }) }).click();
	await page.getByRole("menuitem", { name: "日本語" }).click();

	await expect(page.locator("html")).toHaveAttribute("lang", "ja");
	await expectNav(page, ja);
	await expect(page).toHaveTitle(pageTitle(ja, "overview"));

	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("lang", "ja");
	await expectNav(page, ja);

	const reply = await page.request.post("/api/language", { data: { language: "xx" } });
	expect(reply.status()).toBe(400);
	expect(await reply.json()).toEqual({ error: ja.errors.unknownLanguage });

	await page.getByRole("button", { name: fill(ja.nav.languageCurrent, { language: "日本語" }) }).click();
	await page.getByRole("menuitem", { name: "English" }).click();
	await expect(page.locator("html")).toHaveAttribute("lang", "en");
	await expectNav(page, en);
});
