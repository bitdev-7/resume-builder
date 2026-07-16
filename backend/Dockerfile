# Backend API (Express + tsx). Runs TypeScript directly via tsx, so devDependencies
# (tsx, typescript) are required at runtime and must NOT be pruned.
#
# Build context is the repo ROOT (see docker-compose.yml) because the backend imports
# the shared root `lib/` and renders HTML from the root `templates/` folder.
FROM node:20-bookworm-slim

# Puppeteer needs a real Chromium to render resume/cover-letter PDFs. Install the
# system package and skip Puppeteer's own ~150MB browser download.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install workspace dependencies. All workspace manifests must be present for `npm ci`.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --include=dev

# Only the code the backend actually needs.
COPY backend ./backend
COPY lib ./lib
COPY templates ./templates
# Skill catalog JSON (imported by lib/tailoring/* and read/written by admin catalog APIs).
COPY data ./data

WORKDIR /app/backend
EXPOSE 4000
CMD ["npx", "tsx", "src/index.ts"]
