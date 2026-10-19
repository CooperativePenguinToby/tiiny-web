// HTTPS-only entrypoint: serves the Next.js app over TLS with either a user-supplied
// certificate (TLS_CERT_FILE + TLS_KEY_FILE) or a self-signed one generated on first run.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { hostname, networkInterfaces } from "node:os";
import path from "node:path";

import next from "next";
import { generate } from "selfsigned";

import { startAgentProxies } from "./src/server/shared/agent-proxy.mjs";

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
	if (!existsSync(certPath) || !existsSync(keyPath)) {
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

const tls = await loadTls();
const app = next({ dev: development, hostname: host, port });
await app.prepare();
const handle = app.getRequestHandler();

createServer({ cert: tls.cert, key: tls.key }, (request, response) => handle(request, response)).listen(
	port,
	host,
	() => {
		console.log(
			`tiiny-web: listening on https://${host}:${port} (${development ? "dev" : "production"}, cert ${tls.source})`
		);
	}
);

startAgentProxies({ tls, host, appPort: port });
