ARG FRONTEND_IMAGE
FROM ${FRONTEND_IMAGE}
USER root
COPY infra/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY infra/frontend/19-azure-dns.envsh /docker-entrypoint.d/19-azure-dns.envsh
RUN chmod +x /docker-entrypoint.d/19-azure-dns.envsh && rm /etc/nginx/conf.d/default.conf
USER 101
