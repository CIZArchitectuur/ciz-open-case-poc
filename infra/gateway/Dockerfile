FROM python:3.13-alpine AS config
ARG ENVIRONMENT=dev
WORKDIR /build
COPY gateway/kong.yml kong.yml
COPY infra/gateway/configure.py configure.py
RUN python configure.py "$ENVIRONMENT"
FROM kong:3.9.3
COPY --from=config /build/azure-kong.yml /etc/kong/kong.yml
ENV KONG_DATABASE=off KONG_DECLARATIVE_CONFIG=/etc/kong/kong.yml \
    KONG_PROXY_LISTEN=0.0.0.0:8000 KONG_ADMIN_LISTEN=off \
    KONG_STATUS_LISTEN=0.0.0.0:8100 KONG_DNS_VALID_TTL=5 \
    KONG_PROXY_ACCESS_LOG=off KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_NGINX_HTTP_CLIENT_MAX_BODY_SIZE=10m
EXPOSE 8000
