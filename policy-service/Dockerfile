FROM rust:1.91-alpine3.22 AS regelrecht-build
ARG REGELRECHT_REVISION=89f43786b66ed270b066ae32a48332ce189c73a5
RUN apk add --no-cache git musl-dev
RUN git init /regelrecht && cd /regelrecht && git remote add origin https://github.com/MinBZK/regelrecht.git \
    && git fetch --depth 1 origin ${REGELRECHT_REVISION} && git checkout FETCH_HEAD
WORKDIR /regelrecht/packages
RUN cargo build --release --package regelrecht-engine --bin evaluate

FROM maven:3.9.9-eclipse-temurin-21-alpine AS development
RUN addgroup -S quarkus && adduser -S quarkus -G quarkus
WORKDIR /workspace/policy-service
COPY --chown=quarkus:quarkus policy-service/pom.xml ./pom.xml
RUN mvn -B dependency:go-offline
COPY --chown=quarkus:quarkus contracts /workspace/contracts
COPY --chown=quarkus:quarkus policy-service/src ./src
RUN mkdir -p /home/quarkus && cp -R /root/.m2 /home/quarkus/.m2 && chown -R quarkus:quarkus /workspace /home/quarkus
ENV HOME=/home/quarkus MAVEN_CONFIG=/home/quarkus/.m2
USER quarkus

FROM development AS build
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /workspace/policy-service/target/quarkus-app/ ./
COPY --from=regelrecht-build --chown=app:app /regelrecht/packages/target/release/evaluate /usr/local/bin/regelrecht-evaluate
USER app
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -q --spider http://localhost:8080/q/health/ready || exit 1
ENTRYPOINT ["java", "-jar", "quarkus-run.jar"]
