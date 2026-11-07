"""Write ARM parameter files without placing secrets in CLI arguments or logs."""
import json
import os
from pathlib import Path
import re
import sys


def parameters(stage, env):
    required = ('AZURE_CLIENT_ID', 'POSTGRES_ADMIN_PASSWORD', 'MINIO_PASSWORD',
                'DEMO_USER_PASSWORD', 'KEYCLOAK_ADMIN_PASSWORD')
    for name in required:
        if not env.get(name):
            raise ValueError(f'Missing repository secret: {name}')
    for name in required[1:]:
        if len(env[name]) < 20 or any(c in env[name] for c in '\r\n'):
            raise ValueError(f'{name} must have at least 20 characters and no newlines')
    if not re.fullmatch(r'[a-z0-9]{3,20}', env.get('AZURE_SUFFIX', '')):
        raise ValueError('AZURE_SUFFIX must contain 3–20 lowercase letters/digits')
    values = dict(environment=env.get('AZURE_ENVIRONMENT', 'dev'), suffix=env['AZURE_SUFFIX'],
                  postgresAdminPassword=env['POSTGRES_ADMIN_PASSWORD'])
    if stage == 'apps':
        for name in ('REGISTRY_PASSWORD', 'DEFAULT_DOMAIN', 'IMAGE_TAG'):
            if not env.get(name):
                raise ValueError(f'Missing deployment output: {name}')
        values.update(registryPassword=env['REGISTRY_PASSWORD'], defaultDomain=env['DEFAULT_DOMAIN'],
                      imageTag=env['IMAGE_TAG'], minioPassword=env['MINIO_PASSWORD'],
                      demoUserPassword=env['DEMO_USER_PASSWORD'],
                      keycloakAdminPassword=env['KEYCLOAK_ADMIN_PASSWORD'])
    return {'$schema': 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
            'contentVersion': '1.0.0.0', 'parameters': {k: {'value': v} for k, v in values.items()}}


if __name__ == '__main__':
    try:
        stage = sys.argv[1]
        if stage not in ('validate', 'bootstrap', 'apps'):
            raise ValueError('Expected validate, bootstrap or apps')
        payload = parameters(stage, os.environ)
        if stage != 'validate':
            path = Path(os.environ['RUNNER_TEMP']) / f'{stage}.parameters.json'
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w') as output:
                json.dump(payload, output)
    except ValueError as error:
        sys.exit(str(error))
