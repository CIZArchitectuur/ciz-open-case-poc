targetScope = 'resourceGroup'

param location string = resourceGroup().location
param environment string = 'dev'
param suffix string

@description('Image tag, normally the Git commit SHA.')
param imageTag string

@secure()
param postgresAdminPassword string
param postgresAdminUser string = 'cizadmin'

var prefix = 'ciz-open-case-${environment}'
var acrName = 'cizopencase${suffix}'
var storageName = 'cizcase${suffix}'
var postgresName = '${prefix}-pg-${suffix}'
var environmentName = '${prefix}-cae'

var acrPullRole = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d'
)

var blobContributorRole = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageName
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresName
}

resource cae 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}

module policy './modules/container-app.bicep' = {
  name: 'policy-service'
  params: {
    name: '${prefix}-policy'
    location: location
    environmentId: cae.id
    image: '${acr.properties.loginServer}/policy-service:${imageTag}'
    acrServer: acr.properties.loginServer
    targetPort: 8080
    externalIngress: false
    env: [
      {
        name: 'OTEL_SDK_DISABLED'
        value: 'true'
      }
      {
        name: 'REGELRECHT_TIMEOUT_SECONDS'
        value: '10'
      }
    ]
    secrets: []
  }
}

module document './modules/container-app.bicep' = {
  name: 'document-service'
  params: {
    name: '${prefix}-document'
    location: location
    environmentId: cae.id
    image: '${acr.properties.loginServer}/document-service:${imageTag}'
    acrServer: acr.properties.loginServer
    targetPort: 8080
    externalIngress: false
    env: [
      {
        name: 'DB_HOST'
        value: postgres.properties.fullyQualifiedDomainName
      }
      {
        name: 'DB_PORT'
        value: '5432'
      }
      {
        name: 'DB_NAME'
        value: 'documents'
      }
      {
        name: 'DB_USER'
        value: postgresAdminUser
      }
      // document-service speaks S3 via the AWS SDK. Azure Blob Storage exposes
      // an S3-compatible API at https://<account>.blob.core.windows.net where the
      // storage account key is used as the access key and the secret key is empty.
      {
        name: 'S3_ENDPOINT'
        value: storage.properties.primaryEndpoints.blob
      }
      {
        name: 'S3_REGION'
        value: location
      }
      {
        name: 'S3_BUCKET'
        value: 'ciz-documents'
      }
      {
        name: 'S3_SECRET_KEY'
        value: ''
      }
      {
        name: 'OTEL_SDK_DISABLED'
        value: 'true'
      }
    ]
    secrets: [
      {
        name: 'db-password'
        value: postgresAdminPassword
      }
      {
        name: 's3-access-key'
        value: storage.listKeys().keys[0].value
      }
    ]
    secretEnv: [
      {
        name: 'DB_PASSWORD'
        secretRef: 'db-password'
      }
      {
        name: 'S3_ACCESS_KEY'
        secretRef: 's3-access-key'
      }
    ]
  }
}

module operaton './modules/container-app.bicep' = {
  name: 'operaton'
  params: {
    name: '${prefix}-operaton'
    location: location
    environmentId: cae.id
    image: '${acr.properties.loginServer}/operaton-ciz:${imageTag}'
    acrServer: acr.properties.loginServer
    targetPort: 8080
    externalIngress: false
    env: [
      {
        name: 'DB_DRIVER'
        value: 'org.postgresql.Driver'
      }
      {
        name: 'DB_URL'
        value: 'jdbc:postgresql://${postgres.properties.fullyQualifiedDomainName}:5432/operaton?sslmode=require'
      }
      {
        name: 'DB_USERNAME'
        value: postgresAdminUser
      }
      {
        name: 'JAVA_OPTS'
        value: '-XX:MaxRAMPercentage=70.0 -XX:ActiveProcessorCount=2'
      }
      {
        name: 'TZ'
        value: 'Europe/Amsterdam'
      }
    ]
    secrets: [
      {
        name: 'db-password'
        value: postgresAdminPassword
      }
    ]
    secretEnv: [
      {
        name: 'DB_PASSWORD'
        secretRef: 'db-password'
      }
    ]
  }
}

module caseApp './modules/container-app.bicep' = {
  name: 'case-service'
  params: {
    name: '${prefix}-case'
    location: location
    environmentId: cae.id
    image: '${acr.properties.loginServer}/case-service:${imageTag}'
    acrServer: acr.properties.loginServer
    targetPort: 8080
    externalIngress: false
    env: [
      {
        name: 'DB_HOST'
        value: postgres.properties.fullyQualifiedDomainName
      }
      {
        name: 'DB_PORT'
        value: '5432'
      }
      {
        name: 'DB_NAME'
        value: 'cases'
      }
      {
        name: 'DB_USER'
        value: postgresAdminUser
      }
      {
        name: 'OPERATON_BASE_URL'
        value: 'https://${operaton.outputs.fqdn}/engine-rest'
      }
      {
        name: 'DOCUMENT_SERVICE_URL'
        value: 'https://${document.outputs.fqdn}'
      }
      {
        name: 'POLICY_SERVICE_URL'
        value: 'https://${policy.outputs.fqdn}'
      }
      {
        name: 'OTEL_SDK_DISABLED'
        value: 'true'
      }
    ]
    secrets: [
      {
        name: 'db-password'
        value: postgresAdminPassword
      }
    ]
    secretEnv: [
      {
        name: 'DB_PASSWORD'
        secretRef: 'db-password'
      }
    ]
  }
}

module frontend './modules/container-app.bicep' = {
  name: 'frontend'
  params: {
    name: '${prefix}-frontend'
    location: location
    environmentId: cae.id
    image: '${acr.properties.loginServer}/frontend:${imageTag}'
    acrServer: acr.properties.loginServer
    targetPort: 8080
    externalIngress: true
    env: [
      {
        name: 'CASE_SERVICE_URL'
        value: 'https://${caseApp.outputs.fqdn}'
      }
    ]
    secrets: []
  }
}

// ACR pull grants
resource policyAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, policy.name, acrPullRole)
  scope: acr
  properties: {
    principalId: policy.outputs.principalId
    roleDefinitionId: acrPullRole
    principalType: 'ServicePrincipal'
  }
}

resource documentAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, document.name, acrPullRole)
  scope: acr
  properties: {
    principalId: document.outputs.principalId
    roleDefinitionId: acrPullRole
    principalType: 'ServicePrincipal'
  }
}

resource operatonAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, operaton.name, acrPullRole)
  scope: acr
  properties: {
    principalId: operaton.outputs.principalId
    roleDefinitionId: acrPullRole
    principalType: 'ServicePrincipal'
  }
}

resource caseAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, caseApp.name, acrPullRole)
  scope: acr
  properties: {
    principalId: caseApp.outputs.principalId
    roleDefinitionId: acrPullRole
    principalType: 'ServicePrincipal'
  }
}

resource frontendAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, frontend.name, acrPullRole)
  scope: acr
  properties: {
    principalId: frontend.outputs.principalId
    roleDefinitionId: acrPullRole
    principalType: 'ServicePrincipal'
  }
}

// document-service is the only application with Blob data-plane access.
resource documentBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, document.name, blobContributorRole)
  scope: storage
  properties: {
    principalId: document.outputs.principalId
    roleDefinitionId: blobContributorRole
    principalType: 'ServicePrincipal'
  }
}

output frontendUrl string = 'https://${frontend.outputs.fqdn}'
output caseServiceFqdn string = caseApp.outputs.fqdn
output documentServiceFqdn string = document.outputs.fqdn
output policyServiceFqdn string = policy.outputs.fqdn
output operatonFqdn string = operaton.outputs.fqdn
