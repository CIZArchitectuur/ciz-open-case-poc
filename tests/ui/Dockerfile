FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends socat && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY playwright.config.ts ./
COPY wlz.spec.ts ./
# The browser uses the same localhost URLs as a human browser. These two
# standard TCP forwarders resolve them to the Compose services inside Docker.
CMD ["sh", "-c", "socat TCP-LISTEN:3000,bind=127.0.0.1,fork,reuseaddr TCP:frontend:8080 & socat TCP-LISTEN:8082,bind=127.0.0.1,fork,reuseaddr TCP:keycloak:8080 & exec npx playwright test"]
