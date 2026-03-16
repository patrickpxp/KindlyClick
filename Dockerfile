FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm --prefix backend ci --omit=dev

COPY backend/src ./backend/src
COPY extension/src/runtimeProtocol.js ./extension/src/runtimeProtocol.js

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "--prefix", "backend", "start"]
