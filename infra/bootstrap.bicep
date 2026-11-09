targetScope = 'resourceGroup'

@description('Azure region for the PoC resources.')
param location string = resourceGroup().location

@description('Short environment name.')
param environment string = 'dev'

@description('Globally unique suffix, for example a short company/environment code.')
param suffix string

@secure()
@description('PostgreSQL administrator password. Store this as a GitHub Environment secret.')
param postgresAdminPassword string

param postgresAdminUser string = 'cizadmin'

var prefix = 'ciz-open-case-${environment}'
var tags = {
  application: 'ciz-open-case-poc'
  environment: environment
  'managed-by': 'bicep'
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-law'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: json('0.1') }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'cizopencase${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'cizcase${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'None'
      virtualNetworkRules: [{ id: '${network.id}/subnets/container-apps', action: 'Allow' }]
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource documents 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'ciz-documents'
  properties: {
    publicAccess: 'None'
  }
}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${prefix}-vnet'
  location: location
  properties: {
    addressSpace: { addressPrefixes: ['10.42.0.0/16'] }
    subnets: [
      {
        name: 'container-apps'
        properties: {
          addressPrefix: '10.42.0.0/23'
          natGateway: { id: nat.id }
          delegations: [{ name: 'container-apps', properties: { serviceName: 'Microsoft.App/environments' } }]
          serviceEndpoints: [{ service: 'Microsoft.Storage' }]
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.42.2.0/27'
          delegations: [{ name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
        }
      }
    ]
  }
}

resource egressIp 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: '${prefix}-egress'
  location: location
  sku: { name: 'Standard' }
  properties: { publicIPAllocationMethod: 'Static' }
}
resource nat 'Microsoft.Network/natGateways@2024-05-01' = {
  name: '${prefix}-nat'
  location: location
  sku: { name: 'Standard' }
  properties: {
    idleTimeoutInMinutes: 4
    publicIpAddresses: [{ id: egressIp.id }]
  }
}
resource postgresDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${prefix}.postgres.database.azure.com'
  location: 'global'
}
resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresDns
  name: 'postgres-vnet'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: network.id } }
}
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${suffix}'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    network: {
      publicNetworkAccess: 'Disabled'
      delegatedSubnetResourceId: '${network.id}/subnets/postgres'
      privateDnsZoneArmResourceId: postgresDns.id
    }
    highAvailability: { mode: 'Disabled' }
  }
  dependsOn: [postgresDnsLink]
}
resource databases 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = [
  for database in ['cases', 'documents', 'operaton', 'bas', 'assessment', 'workflow', 'keycloak']: {
    parent: postgres
    name: database
    properties: { charset: 'UTF8', collation: 'en_US.utf8' }
  }
]

// Kafka wire protocol without a lossy ephemeral broker or an always-on VM.
resource events 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: '${prefix}-events-${suffix}'
  location: location
  sku: { name: 'Standard', tier: 'Standard', capacity: 1 }
  properties: { isAutoInflateEnabled: false, minimumTlsVersion: '1.2' }
}
resource topics 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = [
  for topic in [
    'application.submitted'
    'application.submitted.dlq'
    'application.status.changed'
    'application.status.changed.dlq'
    'document.received'
    'document.received.dlq'
  ]: {
    parent: events
    name: topic
    properties: { partitionCount: 1, messageRetentionInDays: 1 }
  }
]
resource eventAccess 'Microsoft.EventHub/namespaces/authorizationRules@2024-01-01' = {
  parent: events
  name: 'applications'
  properties: { rights: ['Listen', 'Send'] }
}
resource pullToken 'Microsoft.ContainerRegistry/registries/tokens@2023-07-01' = {
  parent: acr
  name: 'container-apps-pull'
  properties: { scopeMapId: '${acr.id}/scopeMaps/_repositories_pull', status: 'enabled' }
}
resource pushToken 'Microsoft.ContainerRegistry/registries/tokens@2023-07-01' = {
  parent: acr
  name: 'github-actions-push'
  properties: { scopeMapId: '${acr.id}/scopeMaps/_repositories_push', status: 'enabled' }
}

var logAnalyticsKey = logAnalytics.listKeys().primarySharedKey

resource containerEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-cae-vnet'
  location: location
  tags: tags
  properties: {
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    vnetConfiguration: {
      infrastructureSubnetId: '${network.id}/subnets/container-apps'
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalyticsKey
      }
    }
  }
}

output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output containerAppsEnvironmentName string = containerEnvironment.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output postgresAdminUser string = postgresAdminUser
output storageAccountName string = storage.name
output storageBlobEndpoint string = storage.properties.primaryEndpoints.blob
output documentsContainerName string = documents.name

output defaultDomain string = containerEnvironment.properties.defaultDomain
output outboundIp string = egressIp.properties.ipAddress

resource eventNetwork 'Microsoft.EventHub/namespaces/networkRuleSets@2024-01-01' = {
  parent: events
  name: 'default'
  properties: {
    defaultAction: 'Deny'
    publicNetworkAccess: 'Enabled'
    trustedServiceAccessEnabled: false
    ipRules: [{ ipMask: egressIp.properties.ipAddress, action: 'Allow' }]
  }
}
