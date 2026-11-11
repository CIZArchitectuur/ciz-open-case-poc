# syntax=docker/dockerfile:1.7
FROM python:3.11-slim-bookworm AS pipeline
ARG PIPELINE_REVISION=a18b0c9db5acd66e389df134d873916e0193d78c
ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 PORT=8000
RUN apt-get update && apt-get install -y --no-install-recommends git curl poppler-utils tesseract-ocr tesseract-ocr-nld libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG PYTORCH_INDEX_URL
RUN if [ -n "${PYTORCH_INDEX_URL}" ]; then \
        pip install --index-url "${PYTORCH_INDEX_URL}" 'torch==2.8.0'; \
    fi
# Both upstream repositories are private. Credentials are ephemeral build secrets,
# never build arguments, image layers or runtime environment variables.
RUN --mount=type=secret,id=github_token,required=true \
    printf 'machine github.com\nlogin token\npassword %s\nmachine api.github.com\nlogin token\npassword %s\n' "$(cat /run/secrets/github_token)" "$(cat /run/secrets/github_token)" > /root/.netrc && \
    chmod 600 /root/.netrc && \
    curl --fail --silent --show-error --connect-timeout 10 --max-time 600 --retry 2 --netrc --location "https://api.github.com/repos/CIZDigitaliseert/document_structuring_pipeline/tarball/${PIPELINE_REVISION}" | tar -xz --strip-components=1 && \
    pip install '.[web]' 'torch==2.8.0' 'transformers==4.57.6' && rm /root/.netrc
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--timeout", "1800", "--bind", "0.0.0.0:8080", "tools.app.wsgi:application"]

FROM pipeline AS azure
COPY document-pipeline/bas-ocr.patch /tmp/bas-ocr.patch
RUN git apply --unidiff-zero /tmp/bas-ocr.patch && rm /tmp/bas-ocr.patch
ENV CIZ_BAS_OCR_ONLY=true
# The upstream validator can print document content and raw exceptions.
CMD ["sh", "-c", "if [ -z \"${OCR_REMOTE_BASE_URL:-}\" ]; then unset OCR_REMOTE_BASE_URL; fi; exec gunicorn --workers 1 --threads 4 --timeout 1800 --bind 0.0.0.0:8080 tools.app.wsgi:application >/dev/null 2>&1"]

FROM pipeline AS runtime
