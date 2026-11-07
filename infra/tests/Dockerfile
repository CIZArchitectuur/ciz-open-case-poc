FROM mcr.microsoft.com/azure-cli:2.89.0 AS contracts
WORKDIR /workspace
COPY infra ./infra
COPY security/keycloak/import ./security/keycloak/import
RUN az bicep install && mkdir /compiled \
    && az bicep build --file infra/bootstrap.bicep --outfile /compiled/bootstrap.json \
    && az bicep build --file infra/apps.bicep --outfile /compiled/apps.json
FROM python:3.13-alpine
WORKDIR /workspace
COPY --from=contracts /compiled /compiled
COPY scripts/azure-parameters.py ./scripts/azure-parameters.py
COPY tests/deployment/test_infrastructure.py ./tests/deployment/test_infrastructure.py
ENV COMPILED_INFRA=/compiled
CMD ["python", "-m", "unittest", "discover", "-s", "tests/deployment", "-p", "test_*.py", "-v"]
