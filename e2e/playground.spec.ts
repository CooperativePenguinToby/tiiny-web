import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { CHAT_MODEL, devicePost, EMBEDDING_MODEL, runningModelIds, selectOption, signIn } from "./helpers";

// "The quick brown fox jumps over the lazy dog." spoken by espeak-ng.
const SPEECH = path.resolve("e2e", "fixtures", "quick-brown-fox.wav");
const ASR_MODEL = process.env.E2E_ASR_MODEL ?? "Qwen3-ASR-1.7B";
const TTS_MODEL = process.env.E2E_TTS_MODEL ?? "Qwen3-CustomVoice-1.7B";
const OCR_MODEL = process.env.E2E_OCR_MODEL ?? "PP-OCRv6-Medium";
const EMBED_MODEL = process.env.E2E_EMBED_MODEL ?? "Qwen3-Embedding-0.6B";
const RERANK_MODEL = process.env.E2E_RERANK_MODEL ?? "Qwen3-Reranker-0.6B";
const RUN = { timeout: 5 * 60_000 };

// The playground loads models on first use; each test unloads the ones it caused to load (Vault's
// embedding model aside, which the device keeps for itself).
function unloadNewModels(): { before: () => Promise<void>; after: () => Promise<void> } {
	let running: string[] = [];
	return {
		before: async () => {
			running = await runningModelIds();
		},
		after: async () => {
			const modelIds = await runningModelIds();
			for (const modelId of modelIds) {
				if (modelId !== EMBEDDING_MODEL && !running.includes(modelId))
					await devicePost(`/api/v1/models/${modelId}/stop`);
			}
		},
	};
}
const newModels = unloadNewModels();
test.beforeEach(newModels.before);
test.afterEach(newModels.after);

async function openTab(page: Page, tab: string, model: string): Promise<void> {
	await signIn(page);
	await page.getByRole("link", { name: "Playground" }).click();
	await page.getByRole("tab", { name: tab }).click();
	await selectOption(page, "Model", new RegExp(`^${model}`));
}

const result = (page: Page) => page.getByTestId("playground-result");

test("#24 speech to text transcribes a recording", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	await openTab(page, "Speech to text", ASR_MODEL);
	await page.getByLabel("Audio file").setInputFiles(SPEECH);
	await page.getByRole("button", { name: "Run" }).click();
	await expect(result(page)).toContainText(/quick brown fox/i, RUN);
	await page.screenshot({ path: "test-results/playground-asr.png", fullPage: true });
});

test("#24 text to speech speaks, and speech to text hears the same words", async ({ page }) => {
	test.setTimeout(15 * 60_000);
	await openTab(page, "Text to speech", TTS_MODEL);
	await page.getByLabel("Text").fill("The lighthouse keeper painted the door blue.");
	await page.getByRole("button", { name: "Run" }).click();
	const audio = page.getByTestId("playground-audio");
	await expect(audio).toBeVisible(RUN);
	const duration = await audio.evaluate(
		(element: HTMLAudioElement) =>
			new Promise<number>((resolve) => {
				if (element.readyState >= 1) resolve(element.duration);
				else element.addEventListener("loadedmetadata", () => resolve(element.duration), { once: true });
			})
	);
	expect(duration).toBeGreaterThan(1);
	const bytes = await audio.evaluate(async (element: HTMLAudioElement) => {
		const response = await fetch(element.src);
		const blob = await response.blob();
		return [...new Uint8Array(await blob.arrayBuffer())];
	});

	await page.getByRole("tab", { name: "Speech to text" }).click();
	await selectOption(page, "Model", new RegExp(`^${ASR_MODEL}`));
	await page
		.getByLabel("Audio file")
		.setInputFiles({ name: "speech.wav", mimeType: "audio/wav", buffer: Buffer.from(bytes) });
	await page.getByRole("button", { name: "Run" }).click();
	await expect(result(page)).toContainText(/lighthouse/i, RUN);
});

test("#24 speech to text refuses audio the device cannot read", async ({ page }) => {
	await signIn(page);
	const response = await page.request.post("/api/playground/asr", {
		multipart: {
			model: "Qwen/Qwen3-ASR-1.7B",
			file: {
				name: "song.mp3",
				mimeType: "audio/mpeg",
				buffer: Buffer.from("ID3\u{4}\0\0\0\0\0\0"),
			},
		},
	});
	expect(response.status()).toBe(400);
	const body = (await response.json()) as { error: string };
	expect(body.error).toContain("WAV");
});

test("#24 OCR reads the text in an image", async ({ page, browser }) => {
	test.setTimeout(10 * 60_000);
	const code = String(1000 + Math.floor(Math.random() * 8999));
	const canvas = await browser.newPage();
	await canvas.setContent(
		`<div id="text" style="font:48px sans-serif;padding:24px;background:#fff;color:#000;display:inline-block">INVOICE ${code} PAID</div>`
	);
	const image = await canvas.locator("#text").screenshot();
	await canvas.close();

	await openTab(page, "OCR", OCR_MODEL);
	await page.getByLabel("Image file").setInputFiles({ name: "invoice.png", mimeType: "image/png", buffer: image });
	await page.getByRole("button", { name: "Run" }).click();
	// The random number must be read exactly; OCR may confuse letter case (e.g. "INVoICE").
	await expect(result(page)).toContainText(new RegExp(`invoice ${code} paid`, "i"), RUN);
});

test("#24 embeddings put similar texts closer than unrelated ones", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	await openTab(page, "Embeddings", EMBED_MODEL);
	await page.getByLabel("Texts").fill("a red apple\na crimson fruit\nthe stock market fell sharply");
	await page.getByRole("button", { name: "Run" }).click();
	await expect(result(page)).toContainText("1024 dimensions", RUN);
	const similar = Number(await page.getByTestId("similarity-0-1").textContent());
	const unrelated = Number(await page.getByTestId("similarity-0-2").textContent());
	expect(similar).toBeGreaterThan(unrelated);
	expect(Number(await page.getByTestId("similarity-0-0").textContent())).toBeCloseTo(1, 2);
});

test("#24 rerank puts the relevant document first", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	await openTab(page, "Rerank", RERANK_MODEL);
	await page.getByLabel("Query").fill("How do I bake bread?");
	await page
		.getByLabel("Documents")
		.fill("The stock market fell today.\nKnead the dough, let it rise, then bake at 220C.\nCats sleep a lot.");
	await page.getByRole("button", { name: "Run" }).click();
	await expect(result(page).getByRole("row").first()).toContainText("Knead the dough", RUN);
});

test("#24 benchmark measures a text model's speed", async ({ page }) => {
	test.setTimeout(10 * 60_000);
	const name = CHAT_MODEL.split("/", 2)[1];
	await openTab(page, "Benchmark", name);
	await page.getByLabel("Tokens to generate").fill("64");
	await page.getByRole("button", { name: "Run" }).click();
	await expect(page.getByTestId("bench-speed")).toBeVisible(RUN);
	const speedText = await page.getByTestId("bench-speed").textContent();
	const speed = Number(speedText?.split(" ", 1)[0]);
	expect(speed).toBeGreaterThan(0);
	expect(await runningModelIds()).toContain(CHAT_MODEL);
});
