param name string
param location string
param environmentId string
param image string
param acrServer string
@secure()
param registryPassword string
param targetPort int = 8080
param externalIngress bool = false
param env array = []
param secrets array = []
param volumes array = []
param volumeMounts array = []
param args array = []
param command array = []
param minReplicas int = 0
param cpu string = '0.25'
param memory string = '0.5Gi'
param readinessPath string = '/q/health/ready'

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  properties: {
    managedEnvironmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: externalIngress
        targetPort: targetPort
        transport: 'http'
        allowInsecure: !externalIngress
      }
      registries: [{ server: acrServer, username: 'container-apps-pull', passwordSecretRef: 'registry-password' }]
      secrets: concat(secrets, [{ name: 'registry-password', value: registryPassword }])
    }
    template: {
      containers: [
        {
          name: name
          image: image
          env: env
          command: empty(command) ? null : command
          args: empty(args) ? null : args
          volumeMounts: volumeMounts
          resources: { cpu: json(cpu), memory: memory }
          probes: empty(readinessPath)
            ? []
            : [
                {
                  type: 'Readiness'
                  httpGet: { path: readinessPath, port: targetPort, scheme: 'HTTP' }
                  initialDelaySeconds: 5
                  periodSeconds: 10
                  timeoutSeconds: 3
                  failureThreshold: 30
                }
                {
                  type: 'Startup'
                  httpGet: { path: readinessPath, port: targetPort, scheme: 'HTTP' }
                  periodSeconds: 10
                  timeoutSeconds: 3
                  failureThreshold: 60
                }
              ]
        }
      ]
      volumes: volumes
      scale: {
        minReplicas: minReplicas
        maxReplicas: 1
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '10' } } }]
      }
    }
  }
}
output fqdn string = app.properties.configuration.ingress.fqdn
