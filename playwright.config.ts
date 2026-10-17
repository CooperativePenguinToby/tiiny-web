import { defineConfig } from "@playwright/test";

// E2E runs against a live server (`npm start`) talking to the real Tiiny device.
export default defineConfig({
	testDir: "e2e",
	timeout: 10 * 60_000,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: process.env.BASE_URL ?? "https://localhost:8443",
		channel: process.env.PW_CHANNEL ?? "chrome",
		ignoreHTTPSErrors: true,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
});
