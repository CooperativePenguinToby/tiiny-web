# tiiny-web

A LAN web UI for a Tiiny device: live device stats, loading/unloading/deleting models, downloading from the
Tiiny store, importing models from Hugging Face, managing the device's agents, streaming chat, and the
device's settings (device info, storage, API access).
It talks to the device's own HTTP API (the same one the `tiiny` CLI and TiinyOS use); the device auth key stays
on the server unless a signed-in user reveals it under Settings → API access. Served over HTTPS only.

UI built on [Devias Material Kit React](https://github.com/devias-io/material-kit-react) (MIT, see
`LICENSE-material-kit-react.md`).

## Run

```sh
npm install
npm run build
ADMIN_PASSWORD='choose-a-password' npm start
```

Then open `https://<this-machine>:8443` and sign in with `ADMIN_PASSWORD`.

On first start a self-signed certificate is generated in `data/tls/` (valid for `localhost`, the host name
and every LAN address of the machine). Browsers will warn until you trust it or supply your own.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | — (required) | Password for the web UI. |
| `PORT` / `HOST` | `8443` / `0.0.0.0` | Listen address. |
| `TLS_CERT_FILE` + `TLS_KEY_FILE` | generated | Use your own certificate (PEM). Set both. |
| `DATA_DIR` | `./data` | Generated certificate and the session secret. |
| `SESSION_SECRET` | generated in `DATA_DIR` | Signs session cookies. Change it to sign everyone out. |
| `TIINY_DEVICE_URL` | from the CLI config | e.g. `http://10.11.0.11`. |
| `TIINY_AUTH_KEY` | from the CLI config | Device API key. |
| `TIINY_CONFIG` | `~/.local/tiiny/config.json` | CLI config to read the two values above from. |
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

## Development

```sh
ADMIN_PASSWORD=dev npm run dev   # HTTPS dev server with hot reload (shares .next: run `npm run build` again before `npm start`)
npm run typecheck
npm run lint
BASE_URL=https://localhost:8443 ADMIN_PASSWORD=... npm run test:e2e   # against a running server + the real device
```

The e2e tests use your installed Google Chrome (`PW_CHANNEL` to override) and drive the real device: they load
and unload `Qwen/Qwen3-Embedding-0.6B` and `Qwen/Qwen3.6-35B-A3B`, download and delete
`PaddlePaddle/PP-OCRv6-Small`, and start then cancel a LoRA import (override with the `E2E_*` variables in
`e2e/`). Each test checks the device is back to its starting state. `e2e/agent-install.spec.ts` installs a
real agent and leaves it installed, so it only runs with `E2E_INSTALL_AGENT=<app id>` (e.g. `sillytavern`).
