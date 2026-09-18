FROM python:3.13-alpine AS dependencies
WORKDIR /workspace
COPY tests/requirements.txt ./tests/requirements.txt
RUN pip install --no-cache-dir -r tests/requirements.txt

FROM dependencies AS test
COPY contracts ./contracts
COPY processes ./processes
COPY tests ./tests
RUN addgroup -S tests && adduser -S tests -G tests && chown -R tests:tests /workspace
USER tests
CMD ["pytest", "-q", "tests"]
