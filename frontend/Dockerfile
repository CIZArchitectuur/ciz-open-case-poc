FROM node:22-alpine AS build
WORKDIR /workspace
ARG VITE_OIDC_AUTHORITY=http://localhost:8082/realms/ciz-poc
ARG VITE_OIDC_CLIENT_ID=ciz-frontend
ARG VITE_OIDC_REDIRECT_URI=http://localhost:3000/oidc/callback
ARG VITE_OIDC_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/aanvrager
ARG VITE_OIDC_ROLE_CLAIM_PATH=realm_access/roles
ENV VITE_OIDC_AUTHORITY=${VITE_OIDC_AUTHORITY} \
    VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID} \
    VITE_OIDC_REDIRECT_URI=${VITE_OIDC_REDIRECT_URI} \
    VITE_OIDC_POST_LOGOUT_REDIRECT_URI=${VITE_OIDC_POST_LOGOUT_REDIRECT_URI} \
    VITE_OIDC_ROLE_CLAIM_PATH=${VITE_OIDC_ROLE_CLAIM_PATH}
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -q --spider http://127.0.0.1:8080/health || exit 1
