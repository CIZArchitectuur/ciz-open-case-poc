# Optional local document-processing pipeline with OpenAI

The default deterministic mock remains the standard configuration for CI and
normal local development. For provider-backed extraction, the optional
`compose.ocr-openai.yaml` overlay builds and runs the pinned internal document
pipeline as a local container. It uses Tesseract OCR and the vision-capable
`gpt-6.1-sol` model through the pipeline's OpenAI-compatible API backend. The
pipeline and OCR engine run locally; document pages sent for vision processing
are sent to OpenAI.

This mode sends document pages/content to OpenAI and incurs separate API usage
charges. A ChatGPT subscription does not include API usage. Use only fictional,
approved test documents; never use real personal or medical information. The
upstream service's Docker log collection is disabled because diagnostic job logs
may include document content. The API key is read from the ignored, local `.env`
file and must never be committed or pasted into chat. Revoke any key that has
been exposed.

After revoking any exposed key, place a newly created key in `OPENAI_API_KEY` in
the project-root `.env` file. The file is ignored by Git and excluded from the
Docker build context. With authorized access to the private source repos, start
the stack explicitly with:

```bash
GH_TOKEN="$(gh auth token)" docker compose -f compose.yaml -f compose.ocr-openai.yaml up -d --build
```

When finished, stop this mode and return to the deterministic default:

```bash
docker compose -f compose.yaml -f compose.ocr-openai.yaml down
docker compose up -d --build
```

OCR/vision output is untrusted. CIZ staff must review it; it is not automatically
converted to validated policy facts. No local vision model is included in this
repository configuration.
