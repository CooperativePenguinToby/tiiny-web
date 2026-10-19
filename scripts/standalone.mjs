// Completes Next's standalone output (.next/standalone) so it runs with this app's own HTTPS server:
// traces server.mjs with the tracer Next uses for its own server and copies the files it needs
// (selfsigned, http-proxy, src/server/shared) alongside the traced app, then adds the static assets
// that the standalone output leaves out. Next and React are already traced by the build.
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

import nft from "next/dist/compiled/@vercel/nft/index.js";

const { nodeFileTrace } = nft;
const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

const { fileList } = await nodeFileTrace([path.join(root, "server.mjs")], {
	base: root,
	ignore: (file) => file.startsWith("node_modules/next/") || file.startsWith("node_modules/react"),
});
for (const file of fileList) {
	await mkdir(path.dirname(path.join(standalone, file)), { recursive: true });
	await cp(path.join(root, file), path.join(standalone, file), { force: false, errorOnExist: false });
}
await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
await cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
console.log(`standalone: added ${fileList.size} files traced from server.mjs`);
