FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 py3-pip

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Production image ────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Python for OFX Direct Connect client
RUN apk add --no-cache python3 py3-pip chromium chromium-chromedriver \
    && pip3 install --break-system-packages ofxtools requests

# Chromium path for finance-dl Selenium
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY src/ofx/client.py ./src/ofx/client.py
COPY src/financedl/config.py ./src/financedl/config.py

# Create required directories
RUN mkdir -p downloads uploads

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3010/health || exit 1

CMD ["node", "dist/index.js"]
