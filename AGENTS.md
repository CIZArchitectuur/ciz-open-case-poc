# Repository guidance

1. Keep everything required to build, test, and run the application in Git and container-based.
2. Do not require host dependencies other than Git, Docker, and Docker Compose.
3. Prefer configuring proven open-source components and framework capabilities over custom infrastructure or framework code.
4. Do not introduce runtime GUI configuration; configuration must be reproducible from code.
5. Treat synchronous APIs as OpenAPI-first and asynchronous interfaces as AsyncAPI-first.
6. Generate API interfaces and transport models from their contracts; do not maintain hand-written duplicates.
7. Services may communicate only through documented APIs or events and may never share databases.
8. Every module must be independently buildable, testable, configured externally, and have its own Dockerfile.
9. External calls require timeouts, bounded retries where appropriate, and structured error handling.
10. Propagate correlation and trace identifiers across requests and events.
11. Do not log case payloads, names, birth dates, applicant identifiers, health data, or other personal data.
12. Treat OCR output as untrusted; explicitly validated data is required before rule evaluation.
13. Keep business and legal rules in RegelRecht rather than hiding them in Java code.
14. Keep integration-specific logic in adapters rather than in the case service.
15. Keep configuration in environment variables and database changes in Flyway migrations.
16. Require automated tests for changes and verify them with the Docker Compose services in `README.md`.
17. Prefer small modules and explicit contracts over shared libraries and hidden coupling.
18. A clean checkout must start with a single Docker Compose command.
