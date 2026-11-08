"""Contract-shaped simulation, not OCR. No payloads or request paths are logged."""
import json
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer

jobs = {}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_json(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/process_pdfs":
            return self.send_json(404, {})
        length = int(self.headers.get("Content-Length", 0))
        if not 0 < length <= 10_100_000:
            return self.send_json(400, {})
        body = self.rfile.read(length)
        if b"%PDF-" not in body:
            return self.send_json(400, {})
        job = uuid.uuid4().hex
        jobs[job] = time.monotonic()
        self.send_json(202, {"job_id": job})

    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"mock": True})
        if self.path.startswith("/api/process_status/"):
            job = self.path.rsplit("/", 1)[1]
            if job not in jobs:
                return self.send_json(404, {})
            return self.send_json(200, {"job_id": job, "status": "completed" if time.monotonic()-jobs[job]>1 else "running",
                                       "run_id": job, "model_id": "simulation-no-ocr"})
        if self.path.startswith("/api/run/") and self.path.endswith("/documents"):
            return self.send_json(200, {"documents": [{"doc_key": "document", "has_ocr_details": True}]})
        if self.path.startswith("/api/run/") and self.path.endswith("/ocr"):
            return self.send_json(200, {"errors": [], "classification_units": [
                {"text": "SIMULATIE: dit is vaste voorbeeldtekst, niet uit het document herkend. Controleer de bron en vul de werkelijk gelezen gegevens in.",
                 "page": 1, "pages": [1], "unit_id": 1, "region_ids": [1], "subdoc_id": "1"}]})
        self.send_json(404, {})

HTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
