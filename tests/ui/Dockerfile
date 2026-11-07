FROM mcr.microsoft.com/playwright:v1.58.2-noble AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends socat && rm -rf /var/lib/apt/lists/*
COPY tests/ui/package.json tests/ui/package-lock.json ./
COPY tests/fixtures/ocr ./fixtures/ocr
COPY frontend/src/documentText.ts ./documentText.ts
RUN npm ci
# The browser uses the same localhost URLs as a human browser. These two
# standard TCP forwarders resolve them to the Compose services inside Docker.
FROM base AS test
COPY tests/ui/playwright.config.ts tests/ui/wlz.spec.ts ./
CMD ["sh", "-c", "socat TCP-LISTEN:3000,bind=127.0.0.1,fork,reuseaddr TCP:frontend:8080 & socat TCP-LISTEN:8082,bind=127.0.0.1,fork,reuseaddr TCP:keycloak:8080 & exec npx playwright test"]

FROM base AS demo
RUN apt-get update && apt-get install -y --no-install-recommends xvfb fluxbox feh x11vnc novnc websockify x11-utils && rm -rf /var/lib/apt/lists/*
COPY tests/ui/playwright.config.ts tests/ui/wlz.spec.ts ./
COPY tests/ui/start-demo.sh ./
EXPOSE 6080
CMD ["sh", "./start-demo.sh"]
