# syntax=docker/dockerfile:1

# Build: installs every dependency, builds the Next.js app, then drops the dev dependencies.
FROM dhi.io/node:26-alpine3.23-dev AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime: the custom HTTPS server (server.mjs) with the built app, running as the image's node user.
FROM dhi.io/node:26-alpine3.23-dev
WORKDIR /app
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	HOST=0.0.0.0 \
	PORT=8443 \
	DATA_DIR=/data
COPY --from=build /app/package.json /app/next.config.mjs /app/server.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src/server/shared ./src/server/shared
# The TLS certificate and key, and the session secret, are created here on first start.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
# The web UI. Each installed device agent also gets an HTTPS listener on its own port (e.g. 9891, 7866, 18880).
EXPOSE 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD ["node", "-e", "require('node:https').get({ host: '127.0.0.1', port: process.env.PORT, path: '/auth/sign-in', rejectUnauthorized: false }, (response) => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
CMD ["node", "server.mjs"]
