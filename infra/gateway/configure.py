"""Render the existing declarative Kong routes for Container Apps DNS."""
from pathlib import Path
import sys

names = {
    'case-service': 'case', 'bas-service': 'bas', 'assessment-service': 'assessment',
    'document-service': 'document', 'policy-service': 'policy', 'operaton': 'operaton',
    'address-validation-adapter': 'address', 'document-structuring-adapter': 'structuring',
    'impairment-analysis-adapter': 'impairment', 'pipeline-mock': 'pipeline-mock',
}
source = Path('kong.yml').read_text()
# Azure uses platform logs; no unconfigured local collector endpoint.
start = source.index('  - name: opentelemetry\n')
end = source.index('  - name: correlation-id\n', start)
source = source[:start] + source[end:]
for local, azure in names.items():
    source = source.replace(f'http://{local}:8080', f'http://ciz-{sys.argv[1]}-{azure}')
Path('azure-kong.yml').write_text(source)
