# Deployment Checklist — WesOnline Agentic Replenishment Demo

This checklist walks through provisioning Azure resources, configuring environment variables, uploading seed data, and running the nightly stock planner workflow.

> **Full step-by-step CLI commands:** See [deployment-runbook-wesonlinephnak.md](deployment-runbook-wesonlinephnak.md) for the complete runbook with exact commands and known issue fixes.

---

## 1. Azure Resources Required

Create all resources in the **same region** (recommended: `australiaeast`).

| # | Resource | Purpose |
|---|----------|---------|
| 1 | **Resource Group** | Container for all demo resources |
| 2 | **Storage Account** (Blob) | Stores input data and workflow output JSON files |
| 3 | **Logic App (Consumption)** | Nightly `nightly-stock-planner` autonomous agent workflow |
| 4 | **Azure Maps Account** (G2 / Gen2) | Provides weather forecast API for demand uplift |
| 5 | **Azure OpenAI Service** | Hosts the `gpt-4o` model used by the planning agent and Microsoft Agent chat |
| 6 | **Static Web App** | Hosts the operations dashboard and conversational chat UI |
| 7 | **Function App** (Node.js 20) | API proxy — `/api/config` and `/api/chat` |

### Provisioning notes

- **Storage Account** — Create two blob containers: `input` and `output` with public blob read + CORS enabled.
- **Azure OpenAI** — Deploy a `gpt-4o` model with `GlobalStandard` SKU (not `Standard`). Note the endpoint and API key.
- **Azure Maps** — Use `--sku G2 --kind Gen2 --accept-tos`. Use `--account-name` (not `--name`).
- **Logic App (Consumption)** — Deploy via ARM template (`logicapps/consumption/arm-template.json`). Uses `parameters()` instead of `appsetting()`. Enable System-Assigned Managed Identity and assign **Storage Blob Data Contributor** role.
- **Function App** — Linux, Node 20, Consumption plan. Deploy code from `api/` folder.

---

## 2. Environment Variables

### 2a. Logic App (`local.settings.json` / Application Settings)

See `logicapps/nightly-stock-planner/local.settings.example.json` for the template.

| Variable | Description | Example |
|----------|-------------|---------|
| `AzureWebJobsStorage` | Storage connection string used by the Logic App runtime | `DefaultEndpointsProtocol=https;AccountName=...` |
| `FUNCTIONS_WORKER_RUNTIME` | Runtime type | `node` |
| `AZURE_MAPS_KEY` | Azure Maps primary subscription key | `AbCdEf12345...` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint | `https://my-openai.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | `sk-...` |
| `AZURE_OPENAI_DEPLOYMENT` | Model deployment name | `gpt-4o` |
| `AZURE_STORAGE_ACCOUNT_NAME` | Storage account name (used by blob connector) | `southernscoopsstorage` |
| `INPUT_CONTAINER` | Blob container for input files | `input` |
| `OUTPUT_CONTAINER` | Blob container for output files | `output` |

**Local development:** Copy `local.settings.example.json` to `local.settings.json` and fill in your values.

**Azure portal:** Add each variable under Logic App → Configuration → Application settings.

### 2b. Web Frontend (`webapp/.env` / Static Web App Configuration)

See `webapp/.env.example` for the template.

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_MAPS_KEY` | Azure Maps primary subscription key | `AbCdEf12345...` |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI resource endpoint | `https://my-openai.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key | `sk-...` |
| `AZURE_OPENAI_DEPLOYMENT` | Model deployment name | `gpt-4o` |
| `INPUT_BASE` | Relative URL path for input data | `input` |
| `OUTPUT_BASE` | Relative URL path for output data | `output` |

**Local development:** Inject values via a `<script>` block that sets `window.__ENV__` before `config.js` loads (see `webapp/config.js` for details).

**Azure Static Web Apps:** Set environment variables under Configuration → Application settings, and use a build step or `staticwebapp.config.json` route rewrite to serve a generated `env.js`.

---

## 3. Upload Input Files

The workflow reads seed data from the `input` blob container. Upload the four files from the `input/` directory in this repository.

### Using Azure CLI

```bash
# Set your storage account name
STORAGE_ACCOUNT="<your-storage-account-name>"

# Create containers (if not already created)
az storage container create --name input  --account-name $STORAGE_ACCOUNT
az storage container create --name output --account-name $STORAGE_ACCOUNT

# Upload input files
az storage blob upload --account-name $STORAGE_ACCOUNT --container-name input --file input/branches.json         --name branches.json         --overwrite
az storage blob upload --account-name $STORAGE_ACCOUNT --container-name input --file input/sales_recent.json     --name sales_recent.json     --overwrite
az storage blob upload --account-name $STORAGE_ACCOUNT --container-name input --file input/inventory_latest.json --name inventory_latest.json --overwrite
az storage blob upload --account-name $STORAGE_ACCOUNT --container-name input --file input/sku.json              --name sku.json              --overwrite
```

### Using Azure Portal

1. Navigate to your Storage Account → **Containers**.
2. Open the `input` container.
3. Click **Upload** and select all four files:
   - `branches.json`
   - `sales_recent.json`
   - `inventory_latest.json`
   - `sku.json`

---

## 4. Run the Workflow

### Option A — Wait for scheduled trigger

The workflow runs automatically at **03:00 AM Australia/Sydney time** every day. No action needed once deployed.

### Option B — Trigger manually from Azure Portal

1. Navigate to your **Logic App** (`la-wesonlinephnak`) in Azure Portal.
2. Click **Run Trigger** → **Recurrence_03AM_Sydney** → **Run**.
3. Monitor the run under **Run History**.

### Option C — Trigger via REST API (Consumption)

```powershell
az rest --method POST `
  --uri "https://management.azure.com/subscriptions/{subscriptionId}/resourceGroups/wesonlinephnak/providers/Microsoft.Logic/workflows/la-wesonlinephnak/triggers/Recurrence_03AM_Sydney/run?api-version=2016-06-01"
```

### Verify output

After a successful run, check the `output` blob container for:

| File | Contents |
|------|----------|
| `forecast_output.json` | Branch-level demand forecasts with weather data |
| `replenishment_output.json` | Agent recommendations (risk level, reorder qty, explanation) |
| `operator_summary.json` | Run summary with flagged branch count |

These files are consumed by the Static Web App dashboard.

---

## Quick Validation Checklist

- [ ] Resource Group created in `australiaeast`
- [ ] Storage Account provisioned with `input` and `output` containers (public blob read + CORS)
- [ ] Four input files uploaded to the `input` container
- [ ] Empty `workflow_runs.json` (`[]`) seeded in the `output` container
- [ ] Azure Maps account created (G2/Gen2); key copied
- [ ] Azure OpenAI resource created; `gpt-4o` model deployed (GlobalStandard SKU)
- [ ] Logic App (Consumption) deployed via ARM template with parameters configured
- [ ] System-Assigned MSI enabled; `Storage Blob Data Contributor` role assigned
- [ ] Waited 2+ minutes for RBAC propagation
- [ ] Manual workflow run succeeds and 4 output files appear in the `output` container
- [ ] Function App deployed with app settings configured and CORS set
- [ ] Static Web App deployed; `webapp/config.js` points to correct Function App URL
- [ ] Dashboard loads and displays map, charts, and recommendations
- [ ] Microsoft Agent chat responds to operator questions

> **Known issues and fixes:** See [deployment-runbook-wesonlinephnak.md](deployment-runbook-wesonlinephnak.md#known-issues-and-fixes) for 6 documented issues encountered during provisioning.
