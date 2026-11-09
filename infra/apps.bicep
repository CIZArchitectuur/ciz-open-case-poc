targetScope = 'resourceGroup'
param location string = resourceGroup().location
param environment string = 'dev'
param suffix string
param imageTag string
param defaultDomain string
@secure()
param postgresAdminPassword string
@secure()
param registryPassword string
@secure()
param s3ProxyPassword string
@secure()
param demoUserPassword string
@secure()
param keycloakAdminPassword string
param postgresAdminUser string = 'cizadmin'

var prefix = 'ciz-open-case-${environment}'
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = { name: 'cizopencase${suffix}' }
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = { name: 'cizcase${suffix}' }
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = { name: '${prefix}-pg-${suffix}' }
resource cae 'Microsoft.App/managedEnvironments@2024-03-01' existing = { name: '${prefix}-cae-vnet' }
resource events 'Microsoft.EventHub/namespaces@2024-01-01' existing = { name: '${prefix}-events-${suffix}' }
resource eventAccess 'Microsoft.EventHub/namespaces/authorizationRules@2024-01-01' existing = {
  parent: events
  name: 'applications'
}
var publicUrl = 'https://ciz-${environment}-frontend.${defaultDomain}'
var gatewayUrl = 'http://ciz-${environment}-kong'
var issuer = '${publicUrl}/auth/realms/ciz-poc'
var localRealm = loadJsonContent('../security/keycloak/import/ciz-poc-realm.json')
var realm = union(localRealm, {
  sslRequired: 'external'
  users: map(
    localRealm.users,
    user =>
      union(user, {
        credentials: [{ type: 'password', value: demoUserPassword, temporary: false }]
      })
  )
  clients: map(
    localRealm.clients,
    client =>
      client.clientId == 'ciz-frontend'
        ? union(client, {
            redirectUris: ['${publicUrl}/oidc/callback']
            webOrigins: [publicUrl]
            attributes: { 'post.logout.redirect.uris': '${publicUrl}/aanvrager', 'pkce.code.challenge.method': 'S256' }
          })
        : client.clientId == 'ciz-test-harness' ? union(client, { secret: demoUserPassword }) : client
  )
})
var secretValues = {
  'db-password': postgresAdminPassword
  's3-password': s3ProxyPassword
  'blob-account-key': storage.listKeys().keys[0].value
  'keycloak-admin-password': keycloakAdminPassword
  'realm-json': string(realm)
  'kafka-jaas': 'org.apache.kafka.common.security.plain.PlainLoginModule required username="$ConnectionString" password="${eventAccess.listKeys().primaryConnectionString}";'
}
var commonEnv = [
  { name: 'OTEL_SDK_DISABLED', value: 'true' }
  { name: 'API_GATEWAY_URL', value: gatewayUrl }
]
var databaseEnv = [
  { name: 'DB_HOST', value: '${postgres.name}.postgres.database.azure.com' }
  { name: 'DB_PORT', value: '5432' }
  { name: 'DB_USER', value: postgresAdminUser }
  { name: 'DB_PASSWORD', secretRef: 'db-password' }
  { name: 'QUARKUS_DATASOURCE_JDBC_MAX_SIZE', value: '3' }
  { name: 'QUARKUS_DATASOURCE_JDBC_MIN_SIZE', value: '0' }
  { name: 'QUARKUS_DATASOURCE_JDBC_ADDITIONAL_JDBC_PROPERTIES_SSLMODE', value: 'require' }
]
var kafkaEnv = [
  { name: 'KAFKA_BOOTSTRAP_SERVERS', value: '${events.name}.servicebus.windows.net:9093' }
  { name: 'KAFKA_SECURITY_PROTOCOL', value: 'SASL_SSL' }
  { name: 'KAFKA_SASL_MECHANISM', value: 'PLAIN' }
  { name: 'KAFKA_SASL_JAAS_CONFIG', secretRef: 'kafka-jaas' }
  { name: 'KAFKA_ENABLE_IDEMPOTENCE', value: 'false' }
]

var specs = [
  {
    name: 'policy'
    image: '${acr.name}.azurecr.io/policy-service:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.5'
    memory: '1Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: []
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'document'
    image: '${acr.name}.azurecr.io/document-service:${imageTag}'
    database: 'documents'
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: ['s3-password', 'db-password']
    env: [
      { name: 'S3_ENDPOINT', value: 'http://ciz-${environment}-s3' }
      { name: 'S3_REGION', value: 'eu-west-1' }
      { name: 'S3_BUCKET', value: 'ciz-documents' }
      { name: 'S3_ACCESS_KEY', value: 'ciz-storage' }
      { name: 'S3_SECRET_KEY', secretRef: 's3-password' }
    ]
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'operaton'
    image: '${acr.name}.azurecr.io/operaton-ciz:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.5'
    memory: '1Gi'
    readinessPath: '/engine-rest/engine'
    external: false
    port: 8080
    secretNames: ['db-password']
    env: [
      { name: 'DB_DRIVER', value: 'org.postgresql.Driver' }
      {
        name: 'DB_URL'
        value: 'jdbc:postgresql://${postgres.name}.postgres.database.azure.com:5432/operaton?sslmode=require'
      }
      { name: 'DB_USERNAME', value: postgresAdminUser }
      { name: 'DB_PASSWORD', secretRef: 'db-password' }
      { name: 'QUARKUS_DATASOURCE_JDBC_MAX_SIZE', value: '3' }
      { name: 'QUARKUS_DATASOURCE_JDBC_MIN_SIZE', value: '0' }
      { name: 'OTEL_TRACES_EXPORTER', value: 'none' }
      { name: 'OTEL_METRICS_EXPORTER', value: 'none' }
      { name: 'OTEL_LOGS_EXPORTER', value: 'none' }
    ]
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'case'
    image: '${acr.name}.azurecr.io/case-service:${imageTag}'
    database: 'cases'
    kafka: true
    minReplicas: 0
    cpu: '0.5'
    memory: '1Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: ['db-password', 'kafka-jaas']
    env: [
      { name: 'OIDC_AUTH_SERVER_URL', value: 'http://ciz-${environment}-keycloak/auth/realms/ciz-poc' }
      { name: 'OIDC_TOKEN_ISSUER', value: issuer }
      { name: 'OIDC_ROLE_CLAIM_PATH', value: 'ciz_roles' }
      { name: 'CORS_ORIGINS', value: publicUrl }
    ]
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'bas'
    image: '${acr.name}.azurecr.io/bas-service:${imageTag}'
    database: 'bas'
    kafka: true
    minReplicas: 1
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: ['db-password', 'kafka-jaas']
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'assessment'
    image: '${acr.name}.azurecr.io/assessment-service:${imageTag}'
    database: 'assessment'
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: ['db-password']
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'workflow'
    image: '${acr.name}.azurecr.io/workflow-start-adapter:${imageTag}'
    database: 'workflow'
    kafka: true
    minReplicas: 1
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: ['db-password', 'kafka-jaas']
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'address'
    image: '${acr.name}.azurecr.io/address-validation-adapter:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: []
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'structuring'
    image: '${acr.name}.azurecr.io/document-structuring-adapter:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: []
    env: [
      { name: 'PIPELINE_BASE_URL', value: '${gatewayUrl}/internal/document-pipeline' }
      { name: 'PIPELINE_VERSION', value: 'mock-v1' }
      { name: 'PIPELINE_MOCK', value: 'true' }
      { name: 'PIPELINE_CONFIG_JSON', value: '{}' }
    ]
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'impairment'
    image: '${acr.name}.azurecr.io/impairment-analysis-adapter:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/q/health/ready'
    external: false
    port: 8080
    secretNames: []
    env: [
      { name: 'IMPAIRMENT_MOCK', value: 'true' }
      { name: 'IMPAIRMENT_PIPELINE_VERSION', value: 'mock-v1' }
    ]
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'pipeline-mock'
    image: '${acr.name}.azurecr.io/pipeline-mock:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/health'
    external: false
    port: 8080
    secretNames: []
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'status'
    image: '${acr.name}.azurecr.io/status-notification-adapter:${imageTag}'
    database: ''
    kafka: true
    minReplicas: 1
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/ready'
    external: false
    port: 8080
    secretNames: ['kafka-jaas']
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'kong'
    image: '${acr.name}.azurecr.io/gateway:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: ''
    external: false
    port: 8000
    secretNames: []
    env: []
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'frontend'
    image: '${acr.name}.azurecr.io/frontend-azure:${imageTag}'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/health'
    external: true
    port: 8080
    secretNames: []
    env: [
      { name: 'GATEWAY_URL', value: 'http://ciz-${environment}-kong.internal.${defaultDomain}' }
      { name: 'IDENTITY_URL', value: 'http://ciz-${environment}-keycloak.internal.${defaultDomain}' }
    ]
    args: []
    volumes: []
    volumeMounts: []
  }
  {
    name: 'keycloak'
    image: 'quay.io/keycloak/keycloak:26.7.0'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.5'
    memory: '1Gi'
    readinessPath: '/auth/realms/ciz-poc'
    external: false
    port: 8080
    secretNames: ['db-password', 'keycloak-admin-password', 'realm-json']
    env: [
      { name: 'KC_DB', value: 'postgres' }
      { name: 'KC_DB_POOL_INITIAL_SIZE', value: '1' }
      { name: 'KC_DB_POOL_MIN_SIZE', value: '1' }
      { name: 'KC_DB_POOL_MAX_SIZE', value: '5' }
      {
        name: 'KC_DB_URL'
        value: 'jdbc:postgresql://${postgres.name}.postgres.database.azure.com:5432/keycloak?sslmode=require'
      }
      { name: 'KC_DB_USERNAME', value: postgresAdminUser }
      { name: 'KC_DB_PASSWORD', secretRef: 'db-password' }
      { name: 'KC_BOOTSTRAP_ADMIN_USERNAME', value: 'cizadmin' }
      { name: 'KC_BOOTSTRAP_ADMIN_PASSWORD', secretRef: 'keycloak-admin-password' }
      { name: 'KC_HOSTNAME', value: '${publicUrl}/auth' }
      { name: 'KC_PROXY_HEADERS', value: 'xforwarded' }
      { name: 'KC_HTTP_ENABLED', value: 'true' }
      { name: 'KC_HTTP_RELATIVE_PATH', value: '/auth' }
      { name: 'KC_HEALTH_ENABLED', value: 'true' }
    ]
    args: ['start', '--import-realm']
    volumes: [
      { name: 'realm', storageType: 'Secret', secrets: [{ secretRef: 'realm-json', path: 'ciz-poc-realm.json' }] }
    ]
    volumeMounts: [{ volumeName: 'realm', mountPath: '/opt/keycloak/data/import' }]
  }
  {
    name: 's3'
    image: 'andrewgaul/s3proxy:4.1.1@sha256:87662b2a5afcdfa5f478a1c61650bae4c87bbd15f6ff2823236bcfd66ef7fe04'
    database: ''
    kafka: false
    minReplicas: 0
    cpu: '0.25'
    memory: '0.5Gi'
    readinessPath: '/healthz'
    external: false
    port: 8080
    secretNames: ['s3-password', 'blob-account-key']
    env: [
      { name: 'LOG_LEVEL', value: 'warn' }
      { name: 'S3PROXY_AUTHORIZATION', value: 'aws-v2-or-v4' }
      { name: 'S3PROXY_ENDPOINT', value: 'http://0.0.0.0:8080' }
      { name: 'S3PROXY_IDENTITY', value: 'ciz-storage' }
      { name: 'S3PROXY_CREDENTIAL', secretRef: 's3-password' }
      { name: 'JCLOUDS_PROVIDER', value: 'azureblob' }
      { name: 'JCLOUDS_ENDPOINT', value: 'https://${storage.name}.blob.${az.environment().suffixes.storage}' }
      { name: 'JCLOUDS_IDENTITY', value: storage.name }
      { name: 'JCLOUDS_CREDENTIAL', secretRef: 'blob-account-key' }
    ]
    args: []
    volumes: []
    volumeMounts: []
  }
]
module apps './modules/container-app.bicep' = [
  for spec in specs: {
    name: 'app-${spec.name}'
    params: {
      name: 'ciz-${environment}-${spec.name}'
      location: location
      environmentId: cae.id
      image: spec.image
      acrServer: '${acr.name}.azurecr.io'
      registryPassword: registryPassword
      targetPort: spec.port
      externalIngress: spec.external
      minReplicas: spec.minReplicas
      cpu: spec.cpu
      memory: spec.memory
      readinessPath: spec.readinessPath
      args: spec.args
      volumes: spec.volumes
      volumeMounts: spec.volumeMounts
      appSecrets: toObject(spec.secretNames, secret => secret, secret => secretValues[secret])
      env: concat(
        commonEnv,
        empty(spec.database) ? [] : concat(databaseEnv, [{ name: 'DB_NAME', value: spec.database }]),
        spec.kafka ? kafkaEnv : [],
        spec.env
      )
    }
  }
]

output frontendUrl string = publicUrl

resource checkEgress 'Microsoft.App/jobs@2024-03-01' = {
  name: 'ciz-${environment}-egress-check'
  location: location
  properties: {
    environmentId: cae.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 60
      replicaRetryLimit: 1
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
    }
    template: {
      containers: [
        {
          name: 'check-egress'
          image: 'curlimages/curl:8.12.1'
          args: [
            '--fail'
            '--silent'
            '--show-error'
            '--connect-timeout'
            '10'
            '--max-time'
            '30'
            'https://api.ipify.org'
          ]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
        }
      ]
    }
  }
}
