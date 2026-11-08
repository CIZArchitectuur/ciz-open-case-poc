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
- MinIO keeps the existing S3 API. A 10 GiB Azure Files SMB share persists objects;
  the storage firewall allows the Container Apps subnet via a service endpoint.
  This single-replica PoC layout is not a validated production MinIO storage design.
  Azure Blob is not an S3 endpoint and is not used as one.
- HTTP-driven apps have zero minimum replicas and at most one replica. The BAS,
  workflow and status consumers, Keycloak and MinIO retain one replica. Background
  Kafka consumers must remain running to observe new events in this configuration.
- OCR and impairment analysis use explicitly labelled protocol mocks, as in CI.
  The upstream private NLP pipeline and the OpenAI overlay are not deployed.

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

Repository secrets (never put values in a commit):

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Application/client ID of `github-ciz-open-case-poc` |
| `POSTGRES_ADMIN_PASSWORD` | PostgreSQL administrator password |
| `MINIO_PASSWORD` | Internal object-store password |
| `DEMO_USER_PASSWORD` | Password for both fictional demo users and the confidential smoke-test client |
| `KEYCLOAK_ADMIN_PASSWORD` | Initial Keycloak bootstrap administrator password |

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

After deploying, Actions initializes the S3 bucket in an internal Container Apps
job and runs a second job which calls `https://api.ipify.org`. Its observed address
must match the provisioned NAT IP. Actions checks that only the frontend has
external ingress, then runs a containerized smoke test through the public URL:

1. UI health and OIDC discovery with the correct issuer.
2. Anonymous staff requests denied and internal/admin routes blocked.
3. Authentication of the fictional reviewer and access to the staff queue.
4. Creation of a fictional draft, PDF upload and byte-for-byte download.
5. Submission through Kafka and creation of an Operaton task.
6. BAS completion of the labelled OCR and impairment-analysis mocks.

The fictional smoke-test record is retained; no real client data is required.
Smoke tests do not retry non-idempotent writes. A failed smoke test fails the
workflow; there is no automatic database rollback. Browser interaction and file
persistence across an explicit restart are not proven by these smoke checks.

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
