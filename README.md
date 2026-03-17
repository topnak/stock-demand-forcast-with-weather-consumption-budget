# WesOnline — Agentic Demand Forecasting & Stock Replenishment

An Azure-based demo showing how an **autonomous AI agent** can predict demand and recommend stock replenishment for a retail chain — powered by real weather forecasts, deterministic demand modelling, and GPT-4 reasoning.

![Azure](https://img.shields.io/badge/Azure-Logic%20Apps%20%7C%20OpenAI%20%7C%20Maps%20%7C%20Blob%20Storage-0078D4?style=flat&logo=microsoftazure)
![Status](https://img.shields.io/badge/demo-live-brightgreen)

---

## What It Does

Every night at **03:00 AM AEST**, an Azure Logic App workflow automatically:

1. **Reads** branch, sales, and inventory data from Blob Storage
2. **Fetches** tomorrow's weather forecast for each city via Azure Maps
3. **Computes** a deterministic demand baseline (temperature-based uplift)
4. **Sends** all branch data to an Azure OpenAI agent in a single call
5. **Writes** risk assessments and reorder recommendations back to Blob Storage

A premium **dashboard** (Wesfarmers corporate green design system) lets operations teams visualise results with an animated workflow pipeline, AI-powered headline insights, and a built-in **Microsoft Agent** chat assistant that explains the agent's reasoning.

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│ Blob Storage│────▶│ Logic App    │────▶│ Azure OpenAI   │────▶│ Blob Storage │
│ (input)     │     │ (enrich +    │     │ (agent reasons │     │ (output)     │
│             │     │  forecast)   │     │  over branches)│     │              │
└─────────────┘     └──────┬───────┘     └────────────────┘     └──────┬───────┘
                           │                                           │
                    Azure Maps                                  ┌──────┴───────┐
                    Weather API                                 │  Dashboard   │
                                                                │  + Chat      │
                                                                └──────────────┘
```

---

## Architecture

| Component | Azure Service | Purpose |
|---|---|---|
| **Orchestration** | Logic Apps (Consumption) | Nightly autonomous workflow (ARM-deployed) |
| **AI Reasoning** | Azure OpenAI (GPT-4o) | Risk assessment & reorder recommendations |
| **Weather Data** | Azure Maps Weather API | Tomorrow's forecast per city |
| **Data Storage** | Azure Blob Storage | Input seed data + output results (JSON) |
| **Dashboard** | Azure Static Web Apps | Premium UI with KPIs, map, charts, chat |
| **API Proxy** | Azure Functions (Node.js) | Secure proxy for OpenAI + config delivery |

### Key Design Decisions

- **Agent runs ONCE after the loop** — not inside the For Each. One API call for all 6 branches.
- **Demand forecast is deterministic** — computed by the Logic App (temperature uplift formula), not invented by the LLM.
- **Zero secrets in the frontend** — all API keys stay in the Function App; dashboard gets config via `/api/config`.
- **Consumption Logic App** — deployed via ARM template (`logicapps/consumption/arm-template.json`), uses `parameters()` instead of `appsetting()`.

---

## Demo Scenario

**WesOnline** is an Australian electronics retailer operating 6 stores. The primary product is:

| SKU | Product | Price |
|---|---|---|
| EF001 | Pedestal Electric Fan 40cm | AUD $89.00 |

Fan demand is strongly driven by temperature — hotter days mean more sales.

### Branch Network

| Branch | City | Type |
|---|---|---|
| Sydney WesOnline | Sydney, NSW | Flagship |
| Melbourne WesOnline | Melbourne, VIC | Urban |
| Brisbane WesOnline | Brisbane, QLD | Urban |
| Perth WesOnline | Perth, WA | Suburban |
| Adelaide WesOnline | Adelaide, SA | Suburban |
| Gold Coast WesOnline | Gold Coast, QLD | Tourist |

### Demand Forecast Formula

```
IF   max_temp > 30°C  →  predicted = avg_7day × 1.22  (+22%)
ELIF max_temp ≥ 27°C  →  predicted = avg_7day × 1.12  (+12%)
ELSE                   →  predicted = avg_7day × 1.00
```

---

## Project Structure

```
├── api/                          Azure Functions (API proxy)
│   ├── chat/index.js             POST /api/chat → OpenAI proxy
│   └── config/index.js           GET /api/config → runtime config
│
├── input/                        Seed data (uploaded to Blob Storage)
│   ├── branches.json             6 Australian stores
│   ├── sales_recent.json         30 days × 6 branches
│   ├── inventory_latest.json     Current stock per branch
│   └── sku.json                  Product: Pedestal Fan
│
├── logicapps/
│   ├── nightly-stock-planner/
│   │   ├── workflow.json          Logic App Standard definition (reference)
│   │   └── agent.json             Agent configuration reference
│   └── consumption/
│       └── arm-template.json      Consumption Logic App ARM template
│
├── styles/                        Premium design system
│   ├── design-tokens.css          CSS custom properties
│   └── premium-components.css     Reusable component library
│
├── webapp/                        Static Web App (deployed)
│   ├── index.html                 Dashboard UI
│   ├── app.js                     Dashboard logic (~1600 lines)
│   ├── config.js                  API endpoint config
│   ├── styles.css                 Dashboard styles (Wesfarmers green, pipeline animation)
│   ├── styles/
│   │   ├── design-tokens.css      CSS custom properties (colors, spacing, typography)
│   │   └── premium-components.css Reusable component library
│   └── output/                    Local output JSON files for development
│
└── docs/
    ├── reference/
    │   ├── 01-architecture.md     Architecture diagram & details
    │   ├── 02-functional-specification.md
    │   └── 03-agentic-solution.md Agent loop & design rationale
    ├── solution-brief.md
    ├── azure-setup-checklist.md
    ├── deployment-checklist.md
    └── deployment-runbook-wesonlinephnak.md
```

---

## Prerequisites

- Azure subscription
- Azure CLI (`az`) installed and logged in
- Node.js 18+
- The following Azure resources provisioned:

| Resource | Notes |
|---|---|
| Resource Group | e.g. `wesonlinephnak` |
| Azure Logic Apps (Consumption) | ARM-deployed with System-Assigned MSI |
| Azure Blob Storage | Containers: `input`, `output` (public blob read + CORS) |
| Azure OpenAI | GPT-4o deployment (GlobalStandard SKU) |
| Azure Maps | G2 tier (Gen2) for weather API |
| Azure Static Web Apps | Free tier |
| Azure Functions | Node.js 20, Consumption plan |

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/topnak/stock-demand-forcast-with-weather-agentloop.git
cd stock-demand-forcast-with-weather-agentloop
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your Azure resource values
```

Required environment variables:

| Variable | Description |
|---|---|
| `AZURE_MAPS_KEY` | Azure Maps subscription key |
| `AZURE_OPENAI_ENDPOINT` | e.g. `https://your-resource.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | Model deployment name (e.g. `gpt-4o`) |
| `AZURE_STORAGE_ACCOUNT_NAME` | Blob storage account name |

### 3. Upload Seed Data to Blob Storage

```bash
az storage blob upload-batch \
  --account-name <storage-account> \
  --destination input \
  --source input/ \
  --overwrite
```

### 4. Deploy the Logic App (Consumption)

Deploy via ARM template:

```powershell
az deployment group create `
  --resource-group wesonlinephnak `
  --template-file logicapps/consumption/arm-template.json `
  --parameters logicapps/consumption/arm-parameters.wesonlinephnak.json
```

Then assign MSI blob access:

```powershell
$PRINCIPAL_ID = az resource show --resource-group wesonlinephnak `
  --resource-type Microsoft.Logic/workflows --name la-wesonlinephnak `
  --query "identity.principalId" -o tsv

az role assignment create --assignee-object-id $PRINCIPAL_ID `
  --assignee-principal-type ServicePrincipal `
  --role "Storage Blob Data Contributor" `
  --scope "/subscriptions/{sub}/resourceGroups/wesonlinephnak/providers/Microsoft.Storage/storageAccounts/stwesonlinephnak"
```

> **Important:** Wait 2+ minutes for RBAC propagation before triggering the first run.

### 5. Configure the Function App

```bash
cd api
func azure functionapp publish <function-app-name> --javascript
```

Set the following App Settings on the Function App:

| Setting | Value |
|---|---|
| `OPENAI_ENDPOINT` | Your Azure OpenAI endpoint |
| `OPENAI_DEPLOYMENT` | Your model deployment name |
| `OPENAI_API_KEY` | Your Azure OpenAI API key |
| `AZURE_MAPS_KEY` | Your Azure Maps key |
| `INPUT_BASE` | `https://<storage>.blob.core.windows.net/input` |
| `OUTPUT_BASE` | `https://<storage>.blob.core.windows.net/output` |
| `AZURE_STORAGE_ACCOUNT_NAME` | Storage account name |

### 6. Deploy the Dashboard

```bash
# Update webapp/config.js with your Function App URL
az staticwebapp deploy \
  --name <swa-name> \
  --source webapp \
  --env production
```

### 7. Trigger a Run

Either wait until 03:00 AM AEST, or trigger via CLI:

```powershell
az rest --method POST `
  --uri "https://management.azure.com/subscriptions/{sub}/resourceGroups/wesonlinephnak/providers/Microsoft.Logic/workflows/la-wesonlinephnak/triggers/Recurrence_03AM_Sydney/run?api-version=2016-06-01"
```

> **Full deployment guide with known issues:** See [docs/deployment-runbook-wesonlinephnak.md](docs/deployment-runbook-wesonlinephnak.md)

---

## Dashboard Features

| Feature | Description |
|---|---|
| **Headline KPI Card** | AI-generated insight summary, risk distribution bar, weather chips, scrolling news ticker |
| **Compact KPI Tiles** | 5 uniform cards in a balanced grid — Branches, High Risk, Reorder Units, Predicted Demand, Avg Temp |
| **Interactive Map** | Azure Maps with risk-coloured pins and hover popups |
| **Recommendations Carousel** | Per-branch cards with stock metrics, inline AI explanation for each reorder recommendation |
| **Sales Trend** | 14-day line chart per branch |
| **Inventory Overview** | Stacked bar (stock + transit + safety) vs predicted demand line |
| **Animated Pipeline** | Step-by-step workflow visualisation with sequential animation (Load → Weather → Forecast → Agent → Output) and replay button |
| **Workflow Timeline** | Last 20 run history with Azure Portal links |
| **Microsoft Agent Chat** | AI-powered Q&A about branch risk, stock, and weather |

---

## How the Agent Works

The AI agent receives all 6 branches in a **single API call** and evaluates each one:

```
available_stock = stock_on_hand + in_transit
stock_gap       = predicted_demand - available_stock
safety_buffer   = available_stock - safety_stock

HIGH risk:   stock_gap > 0  AND  safety_buffer < 20  →  reorder (min 20, multiples of 10)
MEDIUM risk: stock_gap > 0  BUT  safety_buffer ≥ 20  →  reorder (min 10, multiples of 10)
LOW risk:    adequate coverage                        →  no reorder
```

The agent returns structured JSON with `risk_level`, `reorder_needed`, `recommended_order_qty`, `confidence`, and a natural language `explanation` for each branch.

See [docs/reference/03-agentic-solution.md](docs/reference/03-agentic-solution.md) for the full agent loop walkthrough.

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/reference/01-architecture.md) | Diagrams, resource inventory, data flow, security model |
| [Functional Spec](docs/reference/02-functional-specification.md) | Business rules, schemas, dashboard spec, API endpoints |
| [Agentic Solution](docs/reference/03-agentic-solution.md) | Agent loop, prompt design, guardrails, design rationale |
| [Solution Brief](docs/solution-brief.md) | Business scenario overview |
| [Azure Setup](docs/azure-setup-checklist.md) | Resource provisioning guide |
| [Deployment](docs/deployment-checklist.md) | Step-by-step deployment walkthrough |
| [Deployment Runbook](docs/deployment-runbook-wesonlinephnak.md) | Full CLI commands, known issues & fixes |

---

## Security

- All API keys stored in Azure Function App Settings (never in frontend code)
- Logic App uses Managed Service Identity for Blob Storage access
- Function App CORS restricted to the Static Web App domain
- Chat proxy caps messages at 30 per request
- OpenAI temperature set to 0.2 for conservative, deterministic outputs

---

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestration | Azure Logic Apps (Consumption) |
| AI Model | Azure OpenAI GPT-4o |
| Weather | Azure Maps Weather API v1.1 |
| Storage | Azure Blob Storage |
| Frontend | Vanilla HTML/CSS/JS (no build step) |
| Icons | Lucide Icons v0.344.0 |
| Charts | Chart.js v4.4.7 |
| Maps | Azure Maps Web SDK v3 |
| Font | Inter (Google Fonts) |
| Design System | Wesfarmers Corporate Green (`#00843D`), CSS custom properties, 8px spacing grid |
| API Proxy | Azure Functions (Node.js 20) |
| Hosting | Azure Static Web Apps (Free tier) |

---

## License

This project is provided as a demo. See the repository for license details.
