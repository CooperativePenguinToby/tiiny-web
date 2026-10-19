# syntax=docker/dockerfile:1

# Build: installs every dependency, builds the Next.js app and assembles the standalone output
# (only the files the server actually loads; see scripts/standalone.mjs).
FROM dhi.io/node:26-alpine3.23-dev AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && node scripts/standalone.mjs && mkdir -p /data

# Runtime: the minimal hardened image (no shell or package manager), running as its non-root user 1000.
FROM dhi.io/node:26-alpine3.23
WORKDIR /app
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	HOST=0.0.0.0 \
	PORT=8443 \
	DATA_DIR=/data
COPY --from=build --chown=1000:1000 /app/.next/standalone ./
# The TLS certificate and key, and the session secret, are created here on first start.
COPY --from=build --chown=1000:1000 /data /data
VOLUME ["/data"]
# The web UI, and the device's model APIs. Each installed device agent also gets an HTTPS listener on its own
# port (e.g. 9891, 7866, 18880).
EXPOSE 8443 11443
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD ["node", "-e", "require('node:https').get({ host: '127.0.0.1', port: process.env.PORT, path: '/auth/sign-in', rejectUnauthorized: false }, (response) => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
CMD ["node", "server.mjs"]
