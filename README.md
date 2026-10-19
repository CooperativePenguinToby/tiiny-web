# tiiny-web

A web UI for a Tiiny AI box, and an HTTPS front door for everything the box serves.

The Tiiny serves its own API, its agents and its model APIs over plain HTTP on the LAN. tiiny-web runs next
to it, or on the box itself in Docker, and puts all of that behind HTTPS:

- **A web UI for the whole device**: live stats, models, the model store, Hugging Face imports, agents, chat,
  Vault, a playground for every model type, connectors and the device's settings. It works on desktops and
  phones and is translated into 13 languages.
- **Agents over HTTPS**: each agent the device runs (Open WebUI, SillyTavern, Tiiny Music, …) opens behind
  this app's sign-in, on its own port or on its own subdomain.
- **Model APIs over HTTPS**: the device's OpenAI-compatible, Anthropic and Ollama APIs, for other apps on the
  network, with the device's API key as the credential.

It talks to the device's own HTTP API, the same one the `tiiny` CLI and TiinyOS use. The device's auth key
stays on the server unless a signed-in user reveals it under Settings → API access. Nothing is loaded from the
internet: fonts, icons and agent artwork ship with the app.

<p>
  <img src="docs/screenshots/desktop-overview.png" alt="The Overview page on a desktop" width="74%">
  <img src="docs/screenshots/phone-overview.png" alt="The Overview page on a phone" width="22%">
</p>

## Features

### Overview

Live NPU utilization and memory, system memory and CPU, and storage, refreshed every few seconds; the models
loaded right now with their NPU share and active requests; this week's token usage per model and per app
(this app, TiinyOS, and other API clients), with a table view of the chart.

### Models

**Models** lists the downloaded models with their size and NPU share. Load a model into NPU memory, unload it,
interrupt what it is working on, unload everything at once, or delete it. A model that needs more NPU than is
free says so and can't be loaded until something else is unloaded.

<p>
  <img src="docs/screenshots/desktop-models.png" alt="Models on a desktop" width="74%">
  <img src="docs/screenshots/phone-models.png" alt="Models on a phone" width="22%">
</p>

**Store** is the Tiiny model store: search and filter by type, see a model's details, and download it to the
device. Downloads can be paused, resumed and cancelled.

<p>
  <img src="docs/screenshots/desktop-store.png" alt="Store on a desktop" width="74%">
  <img src="docs/screenshots/phone-store.png" alt="Store on a phone" width="22%">
</p>

**Hugging Face** imports custom models. Check a single repo, or search Hugging Face for fine-tunes and LoRA
adapters of a store model; every result is checked against the device, which decides what it can import (some
repos only after their base model is downloaded). Imports show their progress and can be cancelled.

<img src="docs/screenshots/desktop-hugging-face.png" alt="Hugging Face search on a desktop" width="74%">

### Agents

The agents installed on the device, with their status, CPU and memory use, and whether an update exists.
Install, update, start, stop and delete them, and open a running agent over HTTPS, behind this app's sign-in.
Installs can be paused, resumed and cancelled. Desktop agents are listed with their downloads.

<p>
  <img src="docs/screenshots/desktop-agents.png" alt="Agents on a desktop" width="74%">
  <img src="docs/screenshots/phone-agents.png" alt="Agents on a phone" width="22%">
</p>

### Chat

Streaming chat with any loaded model, or one that loads when you pick it (the app offers to unload others to
make room). **Chat** mode answers directly; **Task** mode works in steps with tools: your Vault, web pages,
connected services and MCP servers, each step shown as it happens. Turn thinking on or off, attach images and
documents, and draw pictures with an image model. Conversations are kept on the device and shared with
TiinyOS.

<p>
  <img src="docs/screenshots/desktop-chat.png" alt="Chat on a desktop" width="74%">
  <img src="docs/screenshots/phone-chat.png" alt="Chat on a phone" width="22%">
</p>

**History** searches, reopens, continues and deletes past conversations.

<p>
  <img src="docs/screenshots/desktop-history.png" alt="Chat history on a desktop" width="74%">
  <img src="docs/screenshots/phone-history.png" alt="Chat history on a phone" width="22%">
</p>

### Vault

The device's knowledge base, which models search in Task mode. **Files**: upload PDF, Word, Excel, CSV, text,
Markdown or HTML files, watch them being indexed, download, rename or delete them, and search Vault the way a
model would.

<p>
  <img src="docs/screenshots/desktop-vault.png" alt="Vault files on a desktop" width="74%">
  <img src="docs/screenshots/phone-vault.png" alt="Vault files on a phone" width="22%">
</p>

**Chat history**: the device summarises each day's conversations into Vault. Choose the time and the model,
read the summaries, or delete them.

<p>
  <img src="docs/screenshots/desktop-vault-summaries.png" alt="Vault chat summaries on a desktop" width="74%">
  <img src="docs/screenshots/phone-vault-summaries.png" alt="Vault chat summaries on a phone" width="22%">
</p>

### Playground

Try every kind of model the device runs; a model loads on its first run.

| | |
|---|---|
| **Speech to text**: transcribe a WAV recording. | **Text to speech**: turn text into speech, with an optional voice. |
| <img src="docs/screenshots/desktop-playground-speech.png" alt="Speech to text"> | <img src="docs/screenshots/desktop-playground-tts.png" alt="Text to speech"> |
| **OCR**: read the text in an image. | **Embeddings**: turn texts into vectors and compare how similar they are. |
| <img src="docs/screenshots/desktop-playground-ocr.png" alt="OCR"> | <img src="docs/screenshots/desktop-playground-embeddings.png" alt="Embeddings"> |
| **Rerank**: order documents by how well they answer a query. | **Benchmark**: measure how fast a text model generates, like `tiiny bench`. |
| <img src="docs/screenshots/desktop-playground-rerank.png" alt="Rerank"> | <img src="docs/screenshots/desktop-playground-benchmark.png" alt="Benchmark"> |

### Connectors

Connect Gmail, Google Calendar, Outlook Mail and Calendar, any IMAP/SMTP mailbox, Telegram, Discord, X and
WhatsApp (by QR code) for models to use in Task mode. Add your own MCP servers by URL or from JSON, and see
the tools each one offers. Connections live on the device and are shared with TiinyOS.

<p>
  <img src="docs/screenshots/desktop-connectors.png" alt="Connectors on a desktop" width="74%">
  <img src="docs/screenshots/phone-connectors.png" alt="Connectors on a phone" width="22%">
</p>
<p>
  <img src="docs/screenshots/desktop-connectors-add-mcp.png" alt="Adding an MCP server on a desktop" width="74%">
  <img src="docs/screenshots/phone-connectors-add-mcp.png" alt="Adding an MCP server on a phone" width="22%">
</p>

### Settings

The device's own settings, as in TiinyOS:

- **My device**: name (renamable), serial number, model and specs.
- **Personalization**: what models know about you in Task mode.
- **Storage**: disk use by category, and every model's and agent's files, deletable.
- **Backup & restore**: save chat history and Vault to your computer, and restore them.
- **System**: auto power-on, TiinyOS updates, restart and shut down.
- **API access**: the HTTPS base URLs of the device's model APIs (see below) and the API key.
- **Network**: Wi-Fi on/off, nearby networks, joining another network (with a warning first, since this app
  may lose the device while it switches), auto-join and forgetting saved networks, and the device's
  interfaces and addresses.

<p>
  <img src="docs/screenshots/desktop-settings.png" alt="Settings on a desktop" width="74%">
  <img src="docs/screenshots/phone-settings.png" alt="Settings on a phone" width="22%">
</p>
<p>
  <img src="docs/screenshots/desktop-settings-api.png" alt="API access on a desktop" width="74%">
  <img src="docs/screenshots/phone-settings-api.png" alt="API access on a phone" width="22%">
</p>
<p>
  <img src="docs/screenshots/desktop-settings-network.png" alt="Network settings on a desktop" width="74%">
  <img src="docs/screenshots/phone-settings-network.png" alt="Network settings on a phone" width="22%">
</p>
<p>
  <img src="docs/screenshots/desktop-settings-wifi-join.png" alt="Joining another Wi-Fi network on a desktop" width="74%">
  <img src="docs/screenshots/phone-settings-wifi-join.png" alt="Joining another Wi-Fi network on a phone" width="22%">
</p>

### Model APIs over HTTPS

Other apps can use the device's models through this app, over HTTPS, with no sign-in: the client's
`Authorization: Bearer <key>` or `x-api-key` header goes to the device as it is, and the device checks it
(the key is under Settings → API access). Each API is reachable three ways:

| | OpenAI-compatible | Anthropic | Ollama |
|---|---|---|---|
| On `API_PORT` | `https://<host>:11443/v1` | `https://<host>:11443` | `https://<host>:11443` |
| On the app's port | `https://<host>:8443/proxy/openai/v1` | `https://<host>:8443/proxy/anthropic` | `https://<host>:8443/proxy/ollama` |
| With `AGENT_DOMAIN` | `https://api.<AGENT_DOMAIN>:8443/v1` | `https://api.<AGENT_DOMAIN>:8443` | `https://api.<AGENT_DOMAIN>:8443` |

Only the model API paths are forwarded (chat, completions, responses, embeddings, rerank, audio, images,
models and messages; Ollama's chat, generate, embed, tags and ps); the rest of the device's API is not
reachable through them. Streams pass through as they come.

```sh
curl https://<host>:11443/v1/chat/completions \
  -H "Authorization: Bearer $TIINY_API_KEY" -H "Content-Type: application/json" \
  -d '{"model": "default", "messages": [{"role": "user", "content": "Hello"}]}'
```

### Languages

English, 简体中文, Español, हिन्दी, Português (Brasil), বাংলা, Русский, 日本語, Français, Deutsch, 한국어, Türkçe and
Italiano. The app follows the browser's language until you pick one from the menu in the top bar; the choice
is kept for a year. Server messages, numbers and dates follow it too.

<p>
  <img src="docs/screenshots/desktop-language-menu.png" alt="The language menu" width="49%">
  <img src="docs/screenshots/desktop-overview-ja.png" alt="The Overview page in Japanese" width="49%">
</p>

### Sign-in

One admin password (`ADMIN_PASSWORD`) protects the UI and the agents. Everything is served over HTTPS with a
certificate generated on first start, or your own.

<p>
  <img src="docs/screenshots/desktop-sign-in.png" alt="Sign-in on a desktop" width="74%">
  <img src="docs/screenshots/phone-sign-in.png" alt="Sign-in on a phone" width="22%">
</p>

## Installation

You need a Tiiny on your network, its address (e.g. `http://10.11.0.11`) and its API key. The `tiiny` CLI
keeps both in `~/.local/tiiny/config.json`; TiinyOS shows the key too.

### Docker (prebuilt image)

Images for `linux/amd64` and `linux/arm64` are published to `ghcr.io/mpretzel16/tiiny-web`: `main` follows the
main branch, and each release `vX.Y.Z` is tagged `X.Y.Z`, `X.Y` and `latest`. The image is built on
`dhi.io/node:26-alpine3.23` and runs as a non-root user with no shell.

```sh
docker run -d --name tiiny-web --restart unless-stopped \
  -p 8443:8443 -p 11443:11443 \
  -e ADMIN_PASSWORD='choose-a-password' \
  -e TIINY_DEVICE_URL=http://10.11.0.11 \
  -e TIINY_AUTH_KEY='the device API key' \
  -v tiiny-data:/data \
  ghcr.io/mpretzel16/tiiny-web:main
```

Add `-p <port>:<port>` for each agent you install (e.g. `9891` for Open WebUI, `7866` for SillyTavern, `18880`
for Tiiny Music), unless you use `AGENT_DOMAIN`.

### Docker Compose

`compose.yaml` builds the image from this repo; to use the prebuilt image instead, replace `build: .` with
`image: ghcr.io/mpretzel16/tiiny-web:main`.

```sh
cp .env.example .env   # fill in ADMIN_PASSWORD, TIINY_DEVICE_URL, TIINY_AUTH_KEY and optionally AGENT_DOMAIN
docker compose up -d --build
```

The certificate and session secret live in the `tiiny-data` volume. Add a port line to `compose.yaml` for each
agent you install, unless you use `AGENT_DOMAIN` (see Notes).

To build both architectures yourself (arm64 runs under QEMU):

```sh
docker buildx build --platform linux/amd64,linux/arm64 -t tiiny-web .
```

The images are built by `.github/workflows/docker.yml` on every push to `main` and every `v*` tag. It needs the
repository secrets `DHI_USERNAME` and `DHI_TOKEN` (a Docker Hub username and access token) to pull the
`dhi.io` base images.

### Without Docker (Node 26)

```sh
npm install
npm run build
ADMIN_PASSWORD='choose-a-password' npm start
```

### First start

Open `https://<this-machine>:8443` and sign in with `ADMIN_PASSWORD`.

A self-signed certificate is generated in `DATA_DIR/tls/` (valid for `localhost`, the host name, every LAN
address of the machine and, with `AGENT_DOMAIN`, its subdomains). Browsers will warn until you trust it, or
supply your own with `TLS_CERT_FILE` and `TLS_KEY_FILE`.

## Configuration

Set these in the environment, or in `.env` next to `compose.yaml` (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | — (required) | Password for the web UI. |
| `PORT` / `HOST` | `8443` / `0.0.0.0` | Listen address. |
| `TLS_CERT_FILE` + `TLS_KEY_FILE` | generated | Use your own certificate (PEM). Set both. |
| `DATA_DIR` | `./data` (`/data` in Docker) | Generated certificate and the session secret. |
| `SESSION_SECRET` | generated in `DATA_DIR` | Signs session cookies. Change it to sign everyone out. |
| `TIINY_DEVICE_URL` | from the CLI config | e.g. `http://10.11.0.11`. |
| `TIINY_AUTH_KEY` | from the CLI config | Device API key. |
| `TIINY_CONFIG` | `~/.local/tiiny/config.json` | CLI config to read the two values above from. |
| `AGENT_DOMAIN` | — | Also serve each agent at `https://<agent>.<AGENT_DOMAIN>` and the model APIs at `https://api.<AGENT_DOMAIN>` on the app's port, e.g. `tiiny.lan`. |
| `API_PORT` | `11443` | HTTPS listener for the device's OpenAI-compatible, Anthropic and Ollama APIs. |
| `HF_CHECK_CACHE_MS` | `3600000` | How long Hugging Face compatibility verdicts are reused. |
| `TIINY_STREAM_WAIT_MS` | `900000` | How long a chat/load request may wait for the device to start answering. |
| `TIINY_STREAM_IDLE_MS` | `300000` | Max gap between streamed chunks. |

## Notes

- The Hugging Face page searches `huggingface.co` from the server (outbound HTTPS) for fine-tunes and LoRA
  adapters of store models, and asks the device whether each can be imported. Some are importable only after
  their base model is downloaded from the store. Verdicts for the result list are cached for
  `HF_CHECK_CACHE_MS` (default 1 hour); the per-repo Details check always asks the device. Imports may first
  download a large toolkit, and keep running on the device if you leave the page.
- The device serves one inference request per model at a time and gives up on requests that wait too long
  behind other clients; the chat page shows that as a "device gave up waiting" error.
- Agents installed on the device serve their web UIs through the device's port 80 under the host name
  `<agent>.agent.tiiny.local`, over plain HTTP and without a login (Open WebUI also runs with its own login
  turned off). This app opens an HTTPS listener on each agent's port number (e.g.
  `https://<this-machine>:18880` for Tiiny Music, `:9891` for Open WebUI) that forwards to that host name,
  websockets included, only for signed-in browsers; those ports must be free on this machine. The device
  itself still serves the agents to anyone on the LAN, so firewall the device if that matters.
- With `AGENT_DOMAIN` set, each agent is also served at `https://<agent>.<AGENT_DOMAIN>` on the app's own port
  (e.g. `https://tiinymusic.tiiny.lan:8443`), so no agent ports are needed. `*.<AGENT_DOMAIN>` must resolve to
  this machine (a wildcard DNS entry on your router, or hosts entries), and the generated certificate then
  covers those names. The Agents page opens agents there through a one-time link (valid 60 seconds, usable
  once) that signs the agent's host in; a browser without that refuses. Agents can't live under a path such
  as `/agent/tiinymusic`: they load their files and APIs from the root of their host.
- The device's model APIs (OpenAI-compatible, Anthropic, Ollama) are served over HTTPS three ways, all
  without a sign-in: on `API_PORT` laid out as the device lays them out (`https://<this-machine>:11443/v1` for
  OpenAI, `https://<this-machine>:11443` for Anthropic and Ollama); at `https://api.<AGENT_DOMAIN>` on the app's
  port when `AGENT_DOMAIN` is set; and under `https://<this-machine>:8443/proxy/openai/v1`, `/proxy/anthropic`
  and `/proxy/ollama`. The client's `Authorization: Bearer <key>` or `x-api-key` header goes to the device as
  is, and the device checks it. Only the model API paths are forwarded (chat, completions, responses,
  embeddings, rerank, audio, images, models, messages; Ollama's chat, generate, embed, tags and ps); the rest of
  the device's API is not reachable through them. Settings → API access lists these base URLs.

## Development

```sh
ADMIN_PASSWORD=dev npm run dev   # HTTPS dev server with hot reload (shares .next: run `npm run build` again before `npm start`)
npm run typecheck
npm run lint
BASE_URL=https://localhost:8443 ADMIN_PASSWORD=... npm run test:e2e   # against a running server + the real device
E2E_AGENT_DOMAIN=tiiny.test ...                                         # when that server has AGENT_DOMAIN=tiiny.test
BASE_URL=https://localhost:8443 ADMIN_PASSWORD=... npm run screenshots  # the README screenshots
```

The e2e tests use your installed Google Chrome (`PW_CHANNEL` to override) and drive the real device: they load
and unload `Qwen/Qwen3-ASR-1.7B`, `Qwen/Qwen3.5-9B` and `Qwen/Qwen3.6-35B-A3B`, download and delete
`PaddlePaddle/PP-OCRv6-Small`, start then cancel a LoRA import, add and remove a Vault file, and change then
restore settings such as the device name, Wi-Fi auto-join and your personalization (override with the `E2E_*`
variables in `e2e/`). Each test checks the device is back to its starting state. Two tests only run when asked:
`e2e/agent-install.spec.ts` installs a real agent and leaves it installed (`E2E_INSTALL_AGENT=<app id>`, e.g.
`sillytavern`), and the restart test in `e2e/power.spec.ts` reboots the device (`E2E_REBOOT=1`).

`npm run screenshots` (`scripts/screenshots.spec.ts`) takes the screenshots in `docs/screenshots/` of the real
app against the real device, in a desktop and a phone view. Personal values (device name and serial, Wi-Fi
networks, addresses, personalization, conversation titles, Vault files and summaries, MCP servers) are
replaced in the page before each shot; it sends one chat message, deletes that conversation afterwards, and
unloads the chat model if it loaded it.

UI built on [Devias Material Kit React](https://github.com/devias-io/material-kit-react) (MIT, see
`LICENSE-material-kit-react.md`).
