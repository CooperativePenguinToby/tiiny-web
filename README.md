# tiiny-web

A LAN web UI for a Tiiny device: live device stats, loading/unloading models, and streaming chat.
It talks to the device's own HTTP API (the same one the `tiiny` CLI uses); the device auth key stays on
the server. Served over HTTPS only.

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

## Development

```sh
ADMIN_PASSWORD=dev npm run dev   # HTTPS dev server with hot reload
npm run typecheck
npm run lint
BASE_URL=https://localhost:8443 ADMIN_PASSWORD=... npm run test:e2e   # against a running server + the real device
```

The e2e tests use your installed Google Chrome (`PW_CHANNEL` to override) and drive the real device.
