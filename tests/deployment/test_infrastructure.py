"""Verify compiled ARM contracts, not Bicep source formatting."""
import importlib.util
import json
import os
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('parameters', 'scripts/azure-parameters.py')
parameters = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parameters)


class DeploymentContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(os.environ.get('COMPILED_INFRA', '/compiled'))
        cls.bootstrap = json.loads((root / 'bootstrap.json').read_text())
        cls.apps = json.loads((root / 'apps.json').read_text())

    def resource(self, template, kind):
        return next(r for r in template['resources'] if r['type'] == kind)

    def test_consumption_environment_uses_delegated_vnet(self):
        env = self.resource(self.bootstrap, 'Microsoft.App/managedEnvironments')['properties']
        self.assertEqual(env['workloadProfiles'], [{'name': 'Consumption', 'workloadProfileType': 'Consumption'}])
        self.assertFalse(env['vnetConfiguration']['internal'])
        network = self.resource(self.bootstrap, 'Microsoft.Network/virtualNetworks')['properties']
        subnet = network['subnets'][0]['properties']
        self.assertEqual(subnet['delegations'][0]['properties']['serviceName'], 'Microsoft.App/environments')
        self.assertIn('natGateway', subnet)

    def test_single_static_nat_public_ip(self):
        ips = [r for r in self.bootstrap['resources'] if r['type'] == 'Microsoft.Network/publicIPAddresses']
        self.assertEqual(len(ips), 1)
        self.assertEqual(ips[0]['sku']['name'], 'Standard')
        self.assertEqual(ips[0]['properties']['publicIPAllocationMethod'], 'Static')
        nat = self.resource(self.bootstrap, 'Microsoft.Network/natGateways')
        self.assertEqual(len(nat['properties']['publicIpAddresses']), 1)

    def test_postgres_has_no_public_access_or_firewall_exception(self):
        postgres = self.resource(self.bootstrap, 'Microsoft.DBforPostgreSQL/flexibleServers')
        self.assertEqual(postgres['properties']['network']['publicNetworkAccess'], 'Disabled')
        self.assertIn('delegatedSubnetResourceId', postgres['properties']['network'])
        self.assertFalse(any('/firewallRules' in r['type'] for r in self.bootstrap['resources']))

    def test_contributor_does_not_create_role_assignments(self):
        for template in (self.bootstrap, self.apps):
            self.assertNotIn('Microsoft.Authorization/roleAssignments', json.dumps(template))
        acr = self.resource(self.bootstrap, 'Microsoft.ContainerRegistry/registries')
        self.assertFalse(acr['properties']['adminUserEnabled'])

    def test_complete_stack_and_only_one_public_app(self):
        specs = self.apps['variables']['specs']
        self.assertEqual({s['name'] for s in specs}, {
            'policy', 'document', 'operaton', 'case', 'bas', 'assessment', 'workflow',
            'address', 'structuring', 'impairment', 'pipeline-mock', 'status', 'kong',
            'frontend', 'keycloak', 's3'})
        self.assertEqual([s['name'] for s in specs if s['external']], ['frontend'])
        for name in ('bas', 'workflow', 'status'):
            self.assertEqual(next(s for s in specs if s['name'] == name)['minReplicas'], 1)
        for name in ('policy', 'document', 'case', 'assessment', 'frontend', 's3', 'keycloak'):
            self.assertEqual(next(s for s in specs if s['name'] == name)['minReplicas'], 0)

    def test_documents_use_stateless_s3_gateway_and_managed_blob(self):
        specs = self.apps['variables']['specs']
        s3 = next(s for s in specs if s['name'] == 's3')
        self.assertEqual(s3['volumes'], [])
        self.assertEqual(s3['volumeMounts'], [])
        self.assertIn('andrewgaul/s3proxy:4.1.1@sha256:', s3['image'])
        config = {e['name']: e for e in s3['env']}
        self.assertEqual(config['JCLOUDS_PROVIDER']['value'], 'azureblob')
        self.assertIn('.blob.', config['JCLOUDS_ENDPOINT']['value'])
        self.assertIn('suffixes.storage', config['JCLOUDS_ENDPOINT']['value'])
        self.assertEqual(config['JCLOUDS_CREDENTIAL']['secretRef'], 'blob-account-key')
        self.assertFalse(any('/fileServices' in r['type'] for r in self.bootstrap['resources']))
        container = self.resource(self.bootstrap, 'Microsoft.Storage/storageAccounts/blobServices/containers')
        self.assertEqual(container['properties']['publicAccess'], 'None')
        document = next(s for s in specs if s['name'] == 'document')
        endpoint = next(e['value'] for e in document['env'] if e['name'] == 'S3_ENDPOINT')
        self.assertNotIn('blob.core.windows.net', endpoint)
        self.assertIn('s3', endpoint)

    def test_identity_provider_persists_and_has_no_baked_passwords(self):
        keycloak = next(s for s in self.apps['variables']['specs'] if s['name'] == 'keycloak')
        self.assertEqual(next(e['value'] for e in keycloak['env'] if e['name'] == 'KC_DB'), 'postgres')
        self.assertEqual(keycloak['volumes'][0]['storageType'], 'Secret')
        self.assertNotIn('ciz-test-only', json.dumps(self.apps['variables']['realm']))
        self.assertEqual(self.apps['parameters']['demoUserPassword']['type'], 'securestring')

    def test_ocr_adapter_has_required_pipeline_configuration(self):
        adapter = next(s for s in self.apps['variables']['specs'] if s['name'] == 'structuring')
        env = {e['name']: e['value'] for e in adapter['env']}
        self.assertEqual(json.loads(env['PIPELINE_CONFIG_JSON']), {})
        self.assertEqual(env['PIPELINE_MOCK'], 'true')

    def test_sensitive_parameters_are_secure(self):
        for name in ('registryPassword', 'postgresAdminPassword', 's3ProxyPassword', 'demoUserPassword', 'keycloakAdminPassword'):
            self.assertEqual(self.apps['parameters'][name]['type'], 'securestring')

    def test_nested_deployments_keep_app_credentials_secure(self):
        module = self.resource(self.apps, 'Microsoft.Resources/deployments')
        nested = module['properties']['template']
        self.assertEqual(nested['parameters']['appSecrets']['type'].lower(), 'secureobject')

    def test_missing_configuration_fails_without_echoing_secrets(self):
        env = dict(AZURE_CLIENT_ID='client', AZURE_SUFFIX='cizdev42',
                   POSTGRES_ADMIN_PASSWORD='secret-value-hidden-123456', S3_PROXY_PASSWORD='another-hidden-value-123456',
                   DEMO_USER_PASSWORD='demo-secret-hidden-123456', KEYCLOAK_ADMIN_PASSWORD='admin-hidden-value-123456')
        self.assertEqual(parameters.parameters('bootstrap', env)['parameters']['suffix']['value'], 'cizdev42')
        del env['DEMO_USER_PASSWORD']
        with self.assertRaisesRegex(ValueError, '^Missing repository secret: DEMO_USER_PASSWORD$'):
            parameters.parameters('bootstrap', env)
        env['DEMO_USER_PASSWORD'] = 'short'
        with self.assertRaisesRegex(ValueError, '^DEMO_USER_PASSWORD must have at least 20 characters and no newlines$'):
            parameters.parameters('bootstrap', env)


if __name__ == '__main__':
    unittest.main()
