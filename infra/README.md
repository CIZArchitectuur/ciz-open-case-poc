# Azure development deployment

Run **Azure deploy** from GitHub Actions (`workflow_dispatch`). The workflow first
runs the same CI workflow as pushes and pull requests. It deploys the selected
commit to the existing resource group `ciz-open-case-poc-dev`; it does not create a
resource group, register subscription providers or grant Azure roles.

## Network and cost choices

- A VNet-integrated workload-profiles environment contains only the **Consumption**
  profile. There are no Dedicated nodes, Application Gateway, Firewall or private
  endpoint charges in this configuration.
- Only `ciz-dev-frontend` has external application ingress, on HTTPS. It serves the
  UI, proxies the public API and Keycloak realm, and blocks internal routes and the
  Keycloak administration API. Every other app has environment-internal ingress.
- One Standard NAT Gateway and one static public IP provide the outgoing Internet
  address. The incoming environment address and outgoing NAT address are distinct.
  NAT does not inspect destinations or filter outgoing application traffic.
- PostgreSQL is private in its own delegated subnet, with a private DNS zone. Seven
  databases separate the domain services, workflow adapter, engine and Keycloak.
  `Standard_B1ms`, 32 GiB storage, seven-day backups and small connection pools limit
  baseline cost. Database accounts currently share the PoC administrator credential.
- Kafka events use one Standard Event Hubs throughput unit, restricted to the NAT
  address, with one partition and one day of retention per topic. Basic does not
  supply the required Kafka interface. This keeps events durable without a broker
  VM. It is a change in infrastructure provider, not a claim of complete Kafka
  feature equivalence; the deployed asynchronous smoke checks must pass.
- Managed Azure Blob Storage stores documents in the private `ciz-documents`
  container in a Standard LRS storage account. The storage firewall allows the
  Container Apps subnet through a service endpoint.
- Azure Blob does not natively implement the S3 API. A pinned S3Proxy 4.1.1
  container translates the existing document-service S3 operations to the Blob
  API. It is stateless, has no data volume, and can scale to zero. No MinIO or
  Azure Files share is deployed in Azure. The tested compatibility scope is the
  document service's bucket readiness, PUT/GET, content type and SHA-256 metadata;
  S3Proxy does not promise every S3 feature (for example Azure-backed S3 versioning).
- The gateway gets an account key as a Container Apps secret. This avoids asking
  the deployment Contributor to grant data-plane roles it cannot grant. A
  dedicated runtime managed identity plus a preassigned Storage Blob Data
  Contributor role is an alternative when an administrator provisions that role.
- HTTP-driven apps have zero minimum replicas and at most one replica. The BAS,
  workflow and status consumers retain one replica to observe new events.
  Keycloak scales to zero, so the first login after inactivity may take longer.
- Log Analytics has a 0.1 GB daily ingestion cap. Once the cap is reached,
  log ingestion may pause until the daily reset.
- The pinned private document pipeline uses `hybrid_paddle` to call the CIZ BAS OCR
  Container App in Sweden Central. It processes each PDF as one document,
  produces classification units with page references, and runs without OpenAI.
  The OCR ingress accepts anonymous requests, so use only fictional or approved
  non-identifiable test documents. The pipeline retains one replica for its
  in-process jobs. Impairment analysis uses an explicitly labelled mock.
  [OCR pipeline documentation](https://github.com/CIZDigitaliseert/document_structuring_pipeline/blob/main/docs/pipeline.md#3b-ocr-pipeline)

Consumption does **not** make the whole stack free when idle. NAT, its public IP,
PostgreSQL, Event Hubs, ACR Basic, retained replicas, storage and logs have ongoing
costs. The templates minimize individual capacities; no measured monthly total or
absolute lowest-cost claim has been established. A stable Internet egress IP is the
reason for the NAT baseline.

“One public ingress” refers to application access. Azure management APIs and the
credential-protected ACR endpoint remain reachable for GitHub-hosted runners;
Event Hubs' public service endpoint accepts only the NAT IP. Storage accepts only
the app subnet. This is not a fully private Azure management/build environment.

## Required GitHub configuration

Set the repository variable `AZURE_SUBSCRIPTION_ID` to the intended target
subscription. For the CIZ architecture sandbox, use the subscription ID for
`ciz_architecture_sbx`. Create the target resource group and grant the GitHub
deployment identity Contributor on that group before dispatching the workflow.
The optional repository variable `OCR_REMOTE_BASE_URL` overrides the BAS OCR
HTTPS origin built into the pinned private pipeline.

Repository secrets (never put values in a commit):

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Application/client ID of `github-ciz-open-case-poc` |
| `POSTGRES_ADMIN_PASSWORD` | PostgreSQL administrator password |
| `S3_PROXY_PASSWORD` | S3 gateway credential; the backend uses a separate Blob account key |
| `DEMO_USER_PASSWORD` | Password for both fictional demo users and the confidential smoke-test client |
| `KEYCLOAK_ADMIN_PASSWORD` | Initial Keycloak bootstrap administrator password |
| `PIPELINE_GITHUB_TOKEN` | Token with read access to the private `CIZDigitaliseert/document_structuring_pipeline` and `CIZDigitaliseert/cizd-nlp` repositories used to build the Azure image |

Passwords must have at least 20 characters, meet each component's password policy
and contain no newlines. Use independent generated values. The realm contains only
the demo users `ciz.medewerker` and `beoordelaar`. Local test passwords and localhost
redirects are replaced in the deployed realm. Keycloak imports only a missing realm;
changing a secret on a later run does not rotate users in an existing realm.

Azure login uses **OIDC federation**, not a stored Azure client secret. The app
registration must trust the exact branch from which the workflow is run:

```text
issuer:   https://token.actions.githubusercontent.com
subject:  repo:CIZArchitectuur@274255285/ciz-open-case-poc@1365628512:ref:refs/heads/<branch>
audience: api://AzureADTokenExchange
```

The exact credential for the deployment branch is committed in
[`federation/github-azure-consumption-deploy.json`](federation/github-azure-consumption-deploy.json).
An owner of the Entra application can apply it with an authenticated Azure CLI:

```sh
az ad app federated-credential create --id <application-client-or-object-id> \
  --parameters @infra/federation/github-azure-consumption-deploy.json
```

GitHub uses immutable owner/repository IDs in this repository's subject. Match the
exact subject shown by `azure/login`; a name-only subject does not match. The first
live check failed with `AADSTS700213`, before any Azure infrastructure was deployed.
Resource-group Contributor does not grant permission to manage Entra application
credentials. Creating this trust requires application ownership or appropriate
Entra rights; reauthentication may also be required by CIZ Conditional Access.

The existing Contributor grant on `ciz-open-case-poc-dev` is the deployment scope.
An administrator must already have registered these subscription resource providers:
`Microsoft.App`, `Microsoft.Network`, `Microsoft.DBforPostgreSQL`, `Microsoft.Storage`,
`Microsoft.ContainerRegistry`, `Microsoft.OperationalInsights`, and `Microsoft.EventHub`.
Quotas, Azure Policy and region capacity still apply.

Contributor cannot create role assignments. The templates therefore use separate
ACR repository tokens for pushing and pulling. ACR admin access remains disabled;
the runtime token has only `_repositories_pull`, while Actions has
`_repositories_push`. Password slot 1 is regenerated on every deployment, masked in
Actions, and passed to ARM in temporary parameter files. Those files are deleted at
the end of the job. Do not cancel a deployment between credential rotation and app
updates; rerun the workflow to recover if interrupted.

## Verification

Run the infrastructure contract tests using only Docker and Compose:

```sh
docker compose --profile test run --build --rm deployment-tests
```

This compiles the Bicep templates inside a container and tests the compiled ARM
resources, application completeness, public ingress count, NAT, private PostgreSQL,
persistence, secure parameters and missing-configuration handling. CI also runs the
application checks listed in the root README.

The Blob container is provisioned by Bicep before the apps start. After deploying,
Actions runs an internal Container Apps job which calls `https://api.ipify.org`. Its observed address
must match the provisioned NAT IP. Actions checks that only the frontend has
external ingress, then runs a containerized smoke test through the public URL:

1. UI health and OIDC discovery with the correct issuer.
2. Anonymous staff requests denied and internal/admin routes blocked.
3. Authentication of the fictional reviewer and access to the staff queue.
4. Creation of a fictional draft, PDF upload and byte-for-byte download.
5. Submission through Kafka and creation of an Operaton task.
6. BAS OCR returns page-linked text and a stored source artifact, with up to
   35 minutes from case submission to allow for GPU cold start and extraction.
7. The labelled impairment-analysis mock completes.

The fictional smoke-test record is retained; no real client data is required.
Smoke tests do not retry non-idempotent writes. A failed smoke test fails the
workflow; there is no automatic database rollback. The Azure smoke check does not itself prove browser interaction or an explicit
restart. CI runs browser tests and an additional byte-for-byte download through
the document API after restarting the volume-free S3Proxy gateway, backed by
Azurite in `compose.azure-blob.yaml`.

## Existing deployments and source state

The new VNet environment uses the name `ciz-open-case-dev-cae-vnet` so that an old
non-VNet environment is not silently replaced. All new apps use `ciz-dev-*` names.
PostgreSQL public/private networking cannot always be changed in place: if the old
server already exists with public networking, migration needs a separate plan;
do not delete databases to make the deployment pass. The workflow intentionally
fails rather than deleting existing resources. Old public apps in this resource
group also cause the ingress verification to fail and need deliberate migration.

Commit the complete application changes before starting a run: Actions checks out
Git, not local uncommitted/untracked files. Keep the resource suffix unchanged
when redeploying so that databases and document storage keep their identity.

### Retest an existing deployment

Run the **Azure smoke test** workflow on `main` to verify the deployed stack without rebuilding or redeploying application images. It uses the existing demo credential and creates fictional test data, including a document upload and asynchronous OCR/analysis checks.
