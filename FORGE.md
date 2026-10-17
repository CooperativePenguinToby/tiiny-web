idea: LAN web wrapper for a Tiiny device (dashboard · model load/unload · streaming chat)   branch: forge/tiiny-web   mode: ultra
stack: Next.js 15 + MUI 7 (devias material-kit-react 4.1.0) · custom Node HTTPS server · device HTTP API (no CLI)   meets {https, sse-streaming, server-held secret}
v1: #1 #2 #3 + xflow A,B   v2: knowledge base, downloads/import, ASR/TTS/image/OCR, connectors/MCP   never-v1: wifi, firmware upgrade, recovery, account
shared-substrate: auth = signed session cookie (src/server/session.ts; checked in dashboard layout + apiRoute) · device = src/server/device.ts (one client) · shell = template dashboard layout/nav · design = template MUI theme · polling = src/hooks/use-polling.ts

device API (recon 2026-10-17): http://10.11.0.11:80, `Authorization: Bearer <authKey from ~/.local/tiiny/config.json>`
  GET  /api/v1/npu/status · /api/v1/models/running · /api/v1/models/?including_downloading=false · /v1/models
  POST /api/v1/models/{id}/launch/stream (SSE: init → progress… → status:running)   POST /api/v1/models/{id}/stop
  POST /v1/chat/completions (OpenAI-compatible)   — inference is serialized per model; queued requests are invisible (`pending` stays empty)

#1 [done]  device dashboard   proves: dashboard shows live NPU/RAM/disk/CPU + running models read from the device   via:oneshot  observed:e2e/dashboard.spec.ts (2 passed, values checked against device API) + test-results/dashboard.png  attempts:1
#2 [done]  model lifecycle    proves: click Load on a downloaded model → it appears running on device + UI; click Unload → gone   via:graft  depends:1  observed:e2e/models.spec.ts (device oracle: running list before/after) + test-results/models-loaded.png  attempts:1
#3 [open]  streaming chat     proves: prompt → tokens stream into the browser from /v1/chat/completions; busy device shows queued state, Stop aborts   via:graft  depends:1
xflow A [done] 1,2  proves: load model → shows running on dashboard → unload → gone                      observed:e2e/models.spec.ts + test-results/dashboard-with-test-model.png  attempts:1  [immutable]
xflow B [open] 2,3  proves: load model → chat with it → reply streams                                   [immutable]
whole-app: HTTPS sign-in → dashboard → load → chat → unload, one session, clean screenshots            [immutable]
assumed: wrapper auth = one admin password (env) + HMAC-signed HttpOnly/Secure cookie · test model for load/unload = Qwen/Qwen3-Embedding-0.6B (1% NPU) so the shared 27B model is never unloaded
deferred: —   left: v2 list above   amend: —
