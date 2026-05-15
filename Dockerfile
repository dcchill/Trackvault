FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8096
ENV TRACKVAULT_DATA=/data
ENV TRACKVAULT_LIBRARY=/music

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY Track.png Track_notext.png ./

RUN mkdir -p /data /music && chown -R node:node /app /data /music

EXPOSE 8096

VOLUME ["/data", "/music"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8096) + '/api/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
