FROM maven:3.9.9-eclipse-temurin-21-alpine AS development
RUN addgroup -S quarkus && adduser -S quarkus -G quarkus
WORKDIR /workspace/document-service
COPY --chown=quarkus:quarkus document-service/pom.xml ./pom.xml
RUN mvn -B dependency:go-offline
COPY --chown=quarkus:quarkus contracts /workspace/contracts
COPY --chown=quarkus:quarkus document-service/src ./src
RUN mkdir -p /home/quarkus && cp -R /root/.m2 /home/quarkus/.m2 && chown -R quarkus:quarkus /workspace /home/quarkus
ENV HOME=/home/quarkus MAVEN_CONFIG=/home/quarkus/.m2
USER quarkus

FROM development AS test
CMD ["mvn", "-B", "test"]

FROM development AS build
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /workspace/document-service/target/quarkus-app/ ./
USER app
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -q --spider http://localhost:8080/q/health/ready || exit 1
ENTRYPOINT ["java", "-jar", "quarkus-run.jar"]
