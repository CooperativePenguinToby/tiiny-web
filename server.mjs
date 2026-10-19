// HTTPS-only entrypoint: serves the Next.js app over TLS with either a user-supplied
// certificate (TLS_CERT_FILE + TLS_KEY_FILE) or a self-signed one generated on first run.
import { randomBytes, X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { hostname, networkInterfaces } from "node:os";
import path from "node:path";

import next from "next";
import { generate } from "selfsigned";

import { agentDomain } from "./src/server/shared/agent-domain.mjs";
import { handleAgentRequest, handleAgentUpgrade, startAgentProxies } from "./src/server/shared/agent-proxy.mjs";

const development = process.argv.includes("--dev");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8443);
const dataDirectory = path.resolve(process.env.DATA_DIR ?? "data");

function fail(message) {
	throw new Error(`tiiny-web: ${message}`);
}

async function readOrCreateSecret(file, create) {
	if (existsSync(file)) {
		const stored = await readFile(file, "utf8");
		return stored.trim();
	}
	const value = await create();
	await writeFile(file, value, { mode: 0o600 });
	return value;
}

function localAltNames() {
	const names = [
		{ type: 2, value: "localhost" },
		{ type: 2, value: hostname() },
		{ type: 7, ip: "127.0.0.1" },
		{ type: 7, ip: "::1" },
	];
	// Agents are served at `<service id>.<AGENT_DOMAIN>`.
	const domain = agentDomain();
	if (domain) names.push({ type: 2, value: domain }, { type: 2, value: `*.${domain}` });
	for (const addresses of Object.values(networkInterfaces())) {
		if (!addresses) continue;
		for (const address of addresses) {
			if (!address.internal && !address.address.startsWith("fe80")) names.push({ type: 7, ip: address.address });
		}
	}
	return names;
}

async function loadTls() {
	const certFile = process.env.TLS_CERT_FILE;
	const keyFile = process.env.TLS_KEY_FILE;
	if (certFile || keyFile) {
		if (!certFile || !keyFile) fail("TLS_CERT_FILE and TLS_KEY_FILE must be set together");
		return { cert: await readFile(certFile), key: await readFile(keyFile), source: certFile };
	}

	const tlsDirectory = path.join(dataDirectory, "tls");
	const certPath = path.join(tlsDirectory, "cert.pem");
	const keyPath = path.join(tlsDirectory, "key.pem");
	// A certificate generated before AGENT_DOMAIN was set (or changed) does not cover the agents' names.
	const domain = agentDomain();
	const coversDomain = () =>
		!domain || (new X509Certificate(readFileSync(certPath)).subjectAltName ?? "").includes(`DNS:*.${domain}`);
	if (!existsSync(certPath) || !existsSync(keyPath) || !coversDomain()) {
		await mkdir(tlsDirectory, { recursive: true });
		const notAfterDate = new Date();
		notAfterDate.setFullYear(notAfterDate.getFullYear() + 2);
		const pems = await generate([{ name: "commonName", value: hostname() }], {
			keyType: "ec",
			curve: "P-256",
			algorithm: "sha256",
			notAfterDate,
			extensions: [
				{ name: "basicConstraints", cA: false },
				{ name: "keyUsage", digitalSignature: true, keyEncipherment: true },
				{ name: "extKeyUsage", serverAuth: true },
				{ name: "subjectAltName", altNames: localAltNames() },
			],
		});
		await writeFile(certPath, pems.cert);
		await writeFile(keyPath, pems.private, { mode: 0o600 });
		console.log(`tiiny-web: generated self-signed certificate ${certPath} (SHA-1 ${pems.fingerprint})`);
	}
	return { cert: await readFile(certPath), key: await readFile(keyPath), source: certPath };
}

if (!process.env.ADMIN_PASSWORD) fail("ADMIN_PASSWORD must be set (the password for signing in to the web UI)");

await mkdir(dataDirectory, { recursive: true });
await chmod(dataDirectory, 0o700);
process.env.SESSION_SECRET ??= await readOrCreateSecret(path.join(dataDirectory, "session-secret"), () =>
	randomBytes(32).toString("hex")
);

if (!development) {
	// Use the config serialized at build time, as Next's own standalone server.js does, so production
	// (including the Docker image's traced standalone output) never needs next.config or build tooling.
	const built = JSON.parse(await readFile(path.join(".next", "required-server-files.json"), "utf8"));
	process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(built.config);
}

const tls = await loadTls();
const app = next({ dev: development, hostname: host, port });
await app.prepare();
const handle = app.getRequestHandler();

const server = createServer({ cert: tls.cert, key: tls.key }, (request, response) => {
	if (!handleAgentRequest(request, response)) void handle(request, response);
});
// Only agents use websockets on this port; anything else is refused as before.
server.on("upgrade", (request, socket, head) => {
	if (!handleAgentUpgrade(request, socket, head)) socket.destroy();
});
server.listen(port, host, () => {
	console.log(
		`tiiny-web: listening on https://${host}:${port} (${development ? "dev" : "production"}, cert ${tls.source})`
	);
});

startAgentProxies({ tls, host, appPort: port });
