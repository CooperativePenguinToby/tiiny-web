import { defineConfig } from "@playwright/test";

// `npm run screenshots`: the README screenshots (see scripts/screenshots.spec.ts).
const config = defineConfig({
	testDir: ".",
	testMatch: "screenshots.spec.ts",
	outputDir: "../test-results/screenshots",
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: process.env.BASE_URL ?? "https://localhost:8443",
		channel: process.env.PW_CHANNEL ?? "chrome",
		ignoreHTTPSErrors: true,
	},
});

export default config;
