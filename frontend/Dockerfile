# Frontend (Next.js 14). Build context is the repo ROOT (see docker-compose.yml)
# because the frontend imports the shared root `lib/` folder.
#
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time, so they
# are passed as build args (sourced from GitHub Secrets by the deploy workflow).
FROM node:20-bookworm-slim

WORKDIR /app

# The root `npm ci` installs all workspaces, including the backend's puppeteer.
# The frontend never renders PDFs, so skip Puppeteer's ~150MB browser download
# (which also fails here because the image has no tar/unzip to extract it).
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --include=dev

COPY frontend ./frontend
COPY lib ./lib
# Shared skill catalog JSON imported by lib/tailoring/* at build time.
COPY data ./data

# Public (browser-visible) build-time config.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_API_URL=
# next.config.js bakes the /api/* rewrite destination at BUILD time, so BACKEND_URL
# must be present here (not only at runtime) or it defaults to http://localhost:4000.
ARG BACKEND_URL=http://backend:4000
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    BACKEND_URL=$BACKEND_URL

RUN npm run build -w resume-frontend

WORKDIR /app/frontend
ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
