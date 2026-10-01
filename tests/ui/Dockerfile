FROM mcr.microsoft.com/playwright:v1.58.2-noble AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends socat && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
# The browser uses the same localhost URLs as a human browser. These two
# standard TCP forwarders resolve them to the Compose services inside Docker.
FROM base AS test
COPY playwright.config.ts wlz.spec.ts ./
CMD ["sh", "-c", "socat TCP-LISTEN:3000,bind=127.0.0.1,fork,reuseaddr TCP:frontend:8080 & socat TCP-LISTEN:8082,bind=127.0.0.1,fork,reuseaddr TCP:keycloak:8080 & exec npx playwright test"]

FROM base AS demo
RUN apt-get update && apt-get install -y --no-install-recommends xvfb fluxbox feh x11vnc novnc websockify x11-utils && rm -rf /var/lib/apt/lists/*
COPY playwright.config.ts wlz.spec.ts ./
COPY start-demo.sh ./
EXPOSE 6080
CMD ["sh", "./start-demo.sh"]
