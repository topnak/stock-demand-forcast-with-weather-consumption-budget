# Deployment Runbook — wesonlinephnak Environment

Complete step-by-step guide to provision and deploy the WesOnline Nightly Stock Planner demo from scratch. Includes exact CLI commands, known issues, and fixes.

---

## Environment Overview

| Property | Value |
|----------|-------|
| **Resource Group** | `wesonlinephnak` |
| **Region** | `australiaeast` |
| **Subscription** | `41da8f32-f7b0-496d-aa3b-d150afea583a` |
| **Business Theme** | WesOnline Electric Fans (Pedestal Fan 40cm, SKU: EF001) |

---

## Resource Inventory

| # | Resource Type | Resource Name | SKU / Plan | Region | Purpose |
|---|--------------|---------------|------------|--------|---------|
| 1 | Resource Group | `wesonlinephnak` | — | Australia East | Container for all resources |
| 2 | Azure OpenAI | `openai-wesonlinephnak` | S0 | Australia East | GPT-4o agent reasoning |
| 3 | OpenAI Deployment | `gpt-4o` | GlobalStandard (10K TPM) | Australia East | Chat completions model |
| 4 | Azure Maps | `mapswesonlinephnak` | G2 (Gen2) | Global (eastus) | Weather forecast API |
| 5 | Storage Account | `stwesonlinephnak` | Standard_LRS | Australia East | Input/output JSON blob storage |
| 6 | Function App | `func-wesonlinephnak` | Consumption (Linux, Node 20) | Australia East | API proxy (chat + config endpoints) |
| 7 | Static Web App | `swa-wesonlinephnak` | Free | Australia East | Dashboard + chat UI |
| 8 | Logic App (Consumption) | `la-wesonlinephnak` | Consumption | Australia East | Nightly stock planner workflow |

### Endpoints

| Service | URL |
|---------|-----|
| Static Web App | `https://mango-glacier-01bf2d500.1.azurestaticapps.net` |
| Function App | `https://func-wesonlinephnak.azurewebsites.net` |
| Config API | `https://func-wesonlinephnak.azurewebsites.net/api/config` |
| Chat API | `https://func-wesonlinephnak.azurewebsites.net/api/chat` |
| OpenAI Endpoint | `https://openai-wesonlinephnak.openai.azure.com` |
| Blob (input) | `https://stwesonlinephnak.blob.core.windows.net/input/` |
| Blob (output) | `https://stwesonlinephnak.blob.core.windows.net/output/` |

---

## Step-by-Step Provisioning Commands

### Prerequisites
- Azure CLI installed and logged in (`az login`)
- Node.js 20+ installed
- Azure Functions Core Tools installed (`npm install -g azure-functions-core-tools@4`)

### Step 1 — Resource Group

```powershell
az group create --name wesonlinephnak --location australiaeast
```

### Step 2 — Azure OpenAI

```powershell
az cognitiveservices account create `
  --name openai-wesonlinephnak `
  --resource-group wesonlinephnak `
  --location australiaeast `
  --kind OpenAI `
  --sku S0 `
  --custom-domain openai-wesonlinephnak
```

Deploy the GPT-4o model:

```powershell
az cognitiveservices account deployment create `
  --name openai-wesonlinephnak `
  --resource-group wesonlinephnak `
  --deployment-name gpt-4o `
  --model-name gpt-4o `
  --model-version "2024-08-06" `
  --model-format OpenAI `
  --sku-capacity 10 `
  --sku-name GlobalStandard
```

> **KNOWN ISSUE**: `--sku-name Standard` fails in `australiaeast` for gpt-4o. Use `GlobalStandard` instead. See [Issue #1](#issue-1--gpt-4o-standard-sku-not-available-in-australiaeast).

Retrieve the key:

```powershell
$OPENAI_KEY = az cognitiveservices account keys list `
  --name openai-wesonlinephnak `
  --resource-group wesonlinephnak `
  --query "key1" -o tsv
```

### Step 3 — Azure Maps

```powershell
az maps account create `
  --account-name mapswesonlinephnak `
  --resource-group wesonlinephnak `
  --sku G2 `
  --kind Gen2 `
  --accept-tos
```

> **KNOWN ISSUE**: `--sku S0` with `--kind Gen2` fails (Gen1 deprecated). `--name` parameter does not work — use `--account-name`. See [Issue #2](#issue-2--azure-maps-naming-and-sku-failures).

Retrieve the key:

```powershell
$MAPS_KEY = az maps account keys list `
  --account-name mapswesonlinephnak `
  --resource-group wesonlinephnak `
  --query "primaryKey" -o tsv
```

### Step 4 — Storage Account

```powershell
az storage account create `
  --name stwesonlinephnak `
  --resource-group wesonlinephnak `
  --location australiaeast `
  --sku Standard_LRS `
  --kind StorageV2 `
  --allow-blob-public-access true
```

Create containers:

```powershell
az storage container create --name input  --account-name stwesonlinephnak --public-access blob --auth-mode key
az storage container create --name output --account-name stwesonlinephnak --public-access blob --auth-mode key
```

Configure CORS (required for dashboard to read blob JSON):

```powershell
az storage cors add `
  --account-name stwesonlinephnak `
  --services b `
  --methods GET HEAD OPTIONS `
  --origins "*" `
  --allowed-headers "*" `
  --exposed-headers "*" `
  --max-age 3600
```

### Step 5 — Upload Seed Data

```powershell
az storage blob upload-batch `
  --account-name stwesonlinephnak `
  --destination input `
  --source input/ `
  --overwrite `
  --auth-mode key
```

This uploads 4 files from the local `input/` folder:
- `branches.json` — 6 Australian branches with lat/lon
- `sales_recent.json` — 7-day sales history per branch
- `inventory_latest.json` — current stock, in-transit, safety stock, avg daily sales
- `sku.json` — product catalogue (EF001)

Also seed the empty workflow runs file (prevents 404 on first Logic App run):

```powershell
az storage blob upload `
  --account-name stwesonlinephnak `
  --container-name output `
  --name workflow_runs.json `
  --data "[]" `
  --content-type application/json `
  --overwrite `
  --auth-mode key
```

> **KNOWN ISSUE**: If `workflow_runs.json` doesn't exist in output container, the first Logic App run will partially fail on `Compose_existing_runs`. See [Issue #4](#issue-4--first-logic-app-run-fails-on-compose_existing_runs).

### Step 6 — Function App

Create the Function App (Linux, Node 20, Consumption plan):

```powershell
az functionapp create `
  --name func-wesonlinephnak `
  --resource-group wesonlinephnak `
  --consumption-plan-location australiaeast `
  --runtime node `
  --runtime-version 20 `
  --os-type Linux `
  --functions-version 4 `
  --storage-account stwesonlinephnak
```

Deploy the Function App code:

```powershell
cd api
func azure functionapp publish func-wesonlinephnak
cd ..
```

Configure app settings:

```powershell
az functionapp config appsettings set `
  --name func-wesonlinephnak `
  --resource-group wesonlinephnak `
  --settings `
    "AZURE_OPENAI_ENDPOINT=https://openai-wesonlinephnak.openai.azure.com" `
    "AZURE_OPENAI_API_KEY=$OPENAI_KEY" `
    "AZURE_OPENAI_DEPLOYMENT=gpt-4o" `
    "AZURE_MAPS_KEY=$MAPS_KEY" `
    "INPUT_BASE=https://stwesonlinephnak.blob.core.windows.net/input" `
    "OUTPUT_BASE=https://stwesonlinephnak.blob.core.windows.net/output" `
    "AZURE_STORAGE_ACCOUNT_NAME=stwesonlinephnak"
```

Configure CORS (allow SWA domain + localhost for dev):

```powershell
az functionapp cors add `
  --name func-wesonlinephnak `
  --resource-group wesonlinephnak `
  --allowed-origins "https://mango-glacier-01bf2d500.1.azurestaticapps.net" "http://localhost:3000"
```

> **NOTE**: Replace the SWA hostname with your actual deployment hostname after creating the SWA in Step 7.

Verify the config endpoint works:

```powershell
Invoke-RestMethod -Uri "https://func-wesonlinephnak.azurewebsites.net/api/config"
```

Expected: JSON with `inputBase`, `outputBase`, `mapsKey` fields.

### Step 7 — Static Web App

```powershell
az staticwebapp create `
  --name swa-wesonlinephnak `
  --resource-group wesonlinephnak `
  --location australiaeast
```

Note the `defaultHostname` from the output (e.g., `mango-glacier-01bf2d500.1.azurestaticapps.net`).

Update `webapp/config.js` with the Function App URLs:

```javascript
window.__APP_CONFIG = {
  CHAT_API_URL:   'https://func-wesonlinephnak.azurewebsites.net/api/chat',
  CONFIG_API_URL: 'https://func-wesonlinephnak.azurewebsites.net/api/config'
};
```

Get the deployment token:

```powershell
$SWA_TOKEN = az staticwebapp secrets list `
  --name swa-wesonlinephnak `
  --query "properties.apiKey" -o tsv
```

Deploy the webapp:

```powershell
npx @azure/static-web-apps-cli deploy ./webapp `
  --deployment-token $SWA_TOKEN `
  --env production
```

### Step 8 — Logic App (Consumption)

Deploy via ARM template:

```powershell
az deployment group create `
  --resource-group wesonlinephnak `
  --template-file logicapps/consumption/arm-template.json `
  --parameters logicapps/consumption/arm-parameters.wesonlinephnak.json `
  --name la-deploy-001
```

The ARM template creates:
- `Microsoft.Logic/workflows` resource with System-Assigned Managed Identity
- Full workflow definition with `parameters()` instead of `appsetting()` (Consumption doesn't support appsettings)
- Recurrence trigger: 03:00 AM AUS Eastern Standard Time

**Parameters file** (`arm-parameters.wesonlinephnak.json`) — not committed to git (contains secrets). Required fields:

| Parameter | Value |
|-----------|-------|
| `logicAppName` | `la-wesonlinephnak` |
| `storageAccountName` | `stwesonlinephnak` |
| `inputContainer` | `input` |
| `outputContainer` | `output` |
| `azureMapsKey` | `<your Azure Maps key>` |
| `openaiEndpoint` | `https://openai-wesonlinephnak.openai.azure.com` |
| `openaiApiKey` | `<your OpenAI key>` |
| `openaiDeployment` | `gpt-4o` |

### Step 9 — Assign MSI Role to Logic App

After deploying, get the Logic App's managed identity principal ID:

```powershell
$PRINCIPAL_ID = az resource show `
  --resource-group wesonlinephnak `
  --resource-type Microsoft.Logic/workflows `
  --name la-wesonlinephnak `
  --query "identity.principalId" -o tsv
```

Assign Storage Blob Data Contributor on the storage account:

```powershell
az role assignment create `
  --assignee-object-id $PRINCIPAL_ID `
  --assignee-principal-type ServicePrincipal `
  --role "Storage Blob Data Contributor" `
  --scope "/subscriptions/41da8f32-f7b0-496d-aa3b-d150afea583a/resourceGroups/wesonlinephnak/providers/Microsoft.Storage/storageAccounts/stwesonlinephnak"
```

> **KNOWN ISSUE**: RBAC role assignment takes 1–5 minutes to propagate. The first Logic App run after role assignment may fail with HTTP 403 on blob reads. See [Issue #3](#issue-3--rbac-propagation-delay-causes-403-on-first-run).

### Step 10 — Trigger Test Run

Wait at least 2 minutes after role assignment, then:

```powershell
az rest --method POST `
  --uri "https://management.azure.com/subscriptions/41da8f32-f7b0-496d-aa3b-d150afea583a/resourceGroups/wesonlinephnak/providers/Microsoft.Logic/workflows/la-wesonlinephnak/triggers/Recurrence_03AM_Sydney/run?api-version=2016-06-01"
```

Check run status after ~45 seconds:

```powershell
az rest --method GET `
  --uri "https://management.azure.com/subscriptions/41da8f32-f7b0-496d-aa3b-d150afea583a/resourceGroups/wesonlinephnak/providers/Microsoft.Logic/workflows/la-wesonlinephnak/runs?api-version=2016-06-01" `
  --query "value[0].{name:name, status:properties.status}" -o json
```

Verify output blobs:

```powershell
az storage blob list `
  --account-name stwesonlinephnak `
  --container-name output `
  --auth-mode key `
  --query "[].{name:name, lastModified:properties.lastModified}" -o table
```

Expected output files:

| File | Contents |
|------|----------|
| `forecast_output.json` | Branch-level demand forecasts with weather data |
| `replenishment_output.json` | Agent recommendations with risk levels |
| `operator_summary.json` | Summary metadata for the dashboard |
| `workflow_runs.json` | Run history (latest 20) |

---

## Known Issues and Fixes

### Issue #1 — GPT-4o Standard SKU not available in australiaeast

**Symptom**: `az cognitiveservices account deployment create` fails with:
```
InvalidDeploymentSkuNotSupported: The 'Standard' sku is not supported for model 'gpt-4o' in location 'australiaeast'
```

**Cause**: The `Standard` SKU for GPT-4o is not available in Australia East. Only `GlobalStandard` (global routing) is supported.

**Fix**: Use `--sku-name GlobalStandard` instead of `--sku-name Standard`:
```powershell
az cognitiveservices account deployment create `
  --sku-name GlobalStandard `
  --sku-capacity 10
```

**Impact**: None — GlobalStandard routes requests to the nearest available region. Latency is comparable.

---

### Issue #2 — Azure Maps naming and SKU failures

**Symptom**: Multiple errors when creating Azure Maps account:

1. Using `--name` parameter: resource appears created but cannot be found afterward
2. Using `--sku S0 --kind Gen2`: fails because Gen1 (S0) is deprecated

**Cause**: Azure Maps CLI uses `--account-name` (not `--name`), and S0 requires Gen1 which is now deprecated.

**Fix**: Use `--account-name` and `G2` SKU:
```powershell
az maps account create `
  --account-name mapswesonlinephnak `
  --resource-group wesonlinephnak `
  --sku G2 `
  --kind Gen2 `
  --accept-tos
```

**Important**: Do not use hyphens in the Maps account name — use a single-word name like `mapswesonlinephnak`.

---

### Issue #3 — RBAC propagation delay causes 403 on first run

**Symptom**: Logic App run fails immediately after role assignment. `Get_branches`, `Get_sales_recent`, and `Get_inventory` all return HTTP 403 (Forbidden).

**Cause**: Azure RBAC role assignments take 1–5 minutes to propagate. Logic App's MSI token cannot access blob storage until propagation completes.

**Fix**: Wait at least **2 minutes** after assigning the `Storage Blob Data Contributor` role before triggering the first Logic App run. If the first run fails with 403, simply wait another minute and re-trigger.

**Prevention**: In the provisioning script, add a `Start-Sleep -Seconds 120` between the role assignment and the first trigger.

---

### Issue #4 — First Logic App run fails on Compose_existing_runs

**Symptom**: Most actions succeed except `Read_existing_workflow_runs` (HTTP 404) and `Compose_existing_runs` (BadRequest). The downstream actions `Compose_new_run_entry`, `Compose_updated_runs`, and `Write_workflow_runs` are skipped.

**Cause**: On the very first run, `workflow_runs.json` does not exist in the output container. The original expression `outputs('Read_existing_workflow_runs')['statusCode']` used `statusCode` which isn't reliably available in Consumption Logic Apps when the HTTP action fails.

**Fixes applied**:

1. **Seed the file** — Upload an empty `[]` array to `output/workflow_runs.json` before the first run:
   ```powershell
   az storage blob upload `
     --account-name stwesonlinephnak `
     --container-name output `
     --name workflow_runs.json `
     --data "[]" `
     --content-type application/json `
     --overwrite --auth-mode key
   ```

2. **Expression fix** — The ARM template uses a more robust expression that checks action status instead of HTTP status code:
   ```
   @if(equals(actions('Read_existing_workflow_runs')['status'], 'Succeeded'), body('Read_existing_workflow_runs'), json('[]'))
   ```
   This correctly handles the 404 case by falling back to an empty array.

---

### Issue #5 — Consumption Logic App uses parameters() not appsetting()

**Symptom**: If you copy the Standard `workflow.json` directly into a Consumption Logic App, all expressions using `appsetting('...')` will fail because Consumption Logic Apps do not support the `appsetting()` function.

**Cause**: Standard Logic Apps (hosted on `Microsoft.Web/sites`) support `appsetting()` for reading Application Settings. Consumption Logic Apps (`Microsoft.Logic/workflows`) use ARM-style `parameters()` instead.

**Fix**: The ARM template at `logicapps/consumption/arm-template.json` already converts all references:

| Standard (workflow.json) | Consumption (ARM template) |
|-------------------------|---------------------------|
| `appsetting('AZURE_STORAGE_ACCOUNT_NAME')` | `parameters('storageAccountName')` |
| `appsetting('INPUT_CONTAINER')` | `parameters('inputContainer')` |
| `appsetting('OUTPUT_CONTAINER')` | `parameters('outputContainer')` |
| `appsetting('AZURE_MAPS_KEY')` | `parameters('azureMapsKey')` |
| `appsetting('AZURE_OPENAI_ENDPOINT')` | `parameters('openaiEndpoint')` |
| `appsetting('AZURE_OPENAI_API_KEY')` | `parameters('openaiApiKey')` |
| `appsetting('AZURE_OPENAI_DEPLOYMENT')` | `parameters('openaiDeployment')` |

Parameters are defined in the workflow `definition.parameters` block and passed values via the ARM `properties.parameters` section.

---

### Issue #6 — Portal URL format differs between Standard and Consumption

**Symptom**: The `portal_url` in `workflow_runs.json` links to the wrong blade in Azure Portal.

**Cause**: Standard Logic Apps use `WorkflowMonitorBlade` under `Microsoft.Web/sites/workflows`. Consumption Logic Apps use `LogicAppRunBlade` under `Microsoft.Logic/workflows`.

**Fix**: The ARM template uses the correct Consumption format:
```
https://portal.azure.com/#blade/Microsoft.Logic/LogicAppRunBlade/id/%2Fsubscriptions%2F{sub}%2FresourceGroups%2F{rg}%2Fproviders%2FMicrosoft.Logic%2Fworkflows%2F{name}%2Fruns%2F{runId}
```

---

## Environment Switching

Three config files need to be swapped to switch between environments:

```powershell
# Switch to wesonlinephnak
Copy-Item .env.wesonlinephnak .env -Force
Copy-Item logicapps\nightly-stock-planner\local.settings.wesonlinephnak.json logicapps\nightly-stock-planner\local.settings.json -Force
Copy-Item webapp\config.wesonlinephnak.js webapp\config.js -Force

# Switch to southern-scoops (original)
Copy-Item .env.southern-scoops .env -Force
Copy-Item logicapps\nightly-stock-planner\local.settings.southern-scoops.json logicapps\nightly-stock-planner\local.settings.json -Force
Copy-Item webapp\config.southern-scoops.js webapp\config.js -Force
```

---

## Tear Down

To delete all resources:

```powershell
az group delete --name wesonlinephnak --yes --no-wait
```

This removes all 8 resources in the group. The Azure Maps account (if in a different RG) must be deleted separately.
