FROM maven:3.9.9-eclipse-temurin-21-alpine AS otel-agent
ARG OTEL_JAVA_AGENT_VERSION=2.31.1
RUN mvn -B dependency:get -Dartifact=io.opentelemetry.javaagent:opentelemetry-javaagent:${OTEL_JAVA_AGENT_VERSION}:jar

FROM operaton/operaton:2.1.4
ARG OTEL_JAVA_AGENT_VERSION=2.31.1

# The CIZ case processes are baked into the image so the engine can run in
# Azure Container Apps, where host folder mounts are not available.
# Locally, docker compose mounts processes/ on top of this directory, so
# process changes still apply without rebuilding the image.
COPY . /operaton/configuration/resources
COPY --from=otel-agent /root/.m2/repository/io/opentelemetry/javaagent/opentelemetry-javaagent/${OTEL_JAVA_AGENT_VERSION}/opentelemetry-javaagent-${OTEL_JAVA_AGENT_VERSION}.jar /otel/opentelemetry-javaagent.jar
