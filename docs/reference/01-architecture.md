# Architecture Diagram & Details

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WesOnline Agentic Replenishment                     │
│                           Architecture Overview                             │
└─────────────────────────────────────────────────────────────────────────────┘

                           ┌──────────────────┐
                           │   Recurrence      │
                           │   Trigger         │
                           │   03:00 AM AEST   │
                           └────────┬─────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     AZURE LOGIC APPS (CONSUMPTION)                            │
│                     (la-wesonlinephnak)                                       │
│                                                                              │
│  ┌─────────────┐   ┌────────────┐   ┌──────────────────┐                    │
│  │ Read Input  │──▶│ For Each   │──▶│ Agent Call        │                    │
│  │ Blobs       │   │ Branch     │   │ (Azure OpenAI)   │                    │
│  │             │   │            │   │                   │                    │
│  │ • branches  │   │ • Filter   │   │ • System prompt   │                    │
│  │ • sales     │   │   sales    │   │ • branchInputs    │                    │
│  │ • inventory │   │ • Filter   │   │ • JSON response   │                    │
│  │             │   │   stock    │   │                   │                    │
│  └─────────────┘   │ • Weather  │   └────────┬──────────┘                    │
│                     │   API call │            │                               │
│                     │ • Compute  │            ▼                               │
│                     │   forecast │   ┌──────────────────┐                    │
│                     │ • Append   │   │ Write Output     │                    │
│                     │   to array │   │ Blobs            │                    │
│                     └────────────┘   │                   │                    │
│                                      │ • forecast.json   │                    │
│                                      │ • repl.json       │                    │
│                                      │ • summary.json    │                    │
│                                      │ • runs.json       │                    │
│                                      └──────────────────┘                    │
└──────────────────────────────────────────────────────────────────────────────┘
        │                       │                        │
        ▼                       ▼                        ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│ Azure Blob   │   │ Azure Maps       │   │ Azure OpenAI         │
│ Storage      │   │ Weather API      │   │ (GPT-4o)             │
│              │   │                  │   │                      │
│ Containers:  │   │ Daily forecast   │   │ Deployment:          │
│ • input/     │   │ per branch city  │   │   gpt-4o             │
│ • output/    │   │ (6 API calls)    │   │                      │
└──────┬───────┘   └──────────────────┘   │ Temperature: 0.2     │
       │                                  │ Max tokens: 4000     │
       │                                  └──────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     DASHBOARD LAYER                                          │
│                                                                              │
│  ┌───────────────────────────────┐   ┌──────────────────────────────────┐   │
│  │  Azure Static Web App        │   │  Azure Function App              │   │
│  │  (swa-wesonlinephnak)        │   │  (func-wesonlinephnak)           │   │
│  │                              │   │                                  │   │
│  │  • index.html                │◀─▶│  GET /api/config                 │   │
│  │  • app.js                    │   │    → AZURE_MAPS_KEY              │   │
│  │  • styles.css                │   │    → INPUT_BASE, OUTPUT_BASE     │   │
│  │  • premium-components.css    │   │                                  │   │
│  │                              │   │  POST /api/chat                  │   │
│  │  Reads:                      │   │    → Proxy to Azure OpenAI       │   │
│  │  • output/*.json (blobs)     │   │    → Keys stay server-side       │   │
│  │  • input/*.json  (blobs)     │   │                                  │   │
│  └───────────────────────────────┘   └──────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Azure Resource Inventory

| Resource | Type | Name | Region | Purpose |
|---|---|---|---|---|
| Resource Group | — | `wesonlinephnak` | Australia East | All resources |
| Logic App (Consumption) | Microsoft.Logic/workflows | `la-wesonlinephnak` | Australia East | Nightly workflow + agent |
| Storage Account | Microsoft.Storage | `stwesonlinephnak` | Australia East | Input/output JSON files |
| Azure OpenAI | Microsoft.CognitiveServices | `openai-wesonlinephnak` | Australia East | GPT-4o model (deployment: `gpt-4o`, GlobalStandard SKU) |
| Azure Maps | Microsoft.Maps | `mapswesonlinephnak` | Global | Weather forecast API (G2/Gen2) |
| Static Web App | Microsoft.Web/staticSites | `swa-wesonlinephnak` | Australia East | Dashboard frontend (Free tier) |
| Function App | Microsoft.Web/sites | `func-wesonlinephnak` | Australia East | API proxy (Linux, Node 20, Consumption) |

**Subscription:** `41da8f32-f7b0-496d-aa3b-d150afea583a`

---

## Data Flow

### 1. Input Stage (Blob Storage → Logic App)

Three JSON files are read from the `input` container at the start of each run:

| File | Content | Records |
|---|---|---|
| `branches.json` | 6 Australian store locations with lat/lon | 6 |
| `sales_recent.json` | 30 days of daily sales per branch | ~180 |
| `inventory_latest.json` | Current stock snapshot per branch | 6 |

All blob reads use **Managed Service Identity** (MSI) authentication — no connection strings or keys in the workflow definition.

### 2. Enrichment Stage (For Each Branch)

For each of the 6 branches, the workflow:

1. **Filters** sales and inventory records for that branch
2. **Calls Azure Maps Weather API** with the branch's latitude/longitude to get tomorrow's forecast
3. **Extracts** stock_on_hand, in_transit, safety_stock, avg_daily_sales
4. **Computes baseline demand forecast** using deterministic uplift logic:
   - Temperature > 30°C → avg7 × 1.22 (+22% uplift)
   - Temperature ≥ 27°C → avg7 × 1.12 (+12% uplift)
   - Otherwise → avg7 × 1.0 (no uplift)
5. **Appends** the enriched branch object to the `branchInputs` array variable

### 3. Agent Stage (Logic App → Azure OpenAI)

After the loop completes, a single HTTP POST sends all 6 branch payloads to Azure OpenAI. The agent evaluates each branch's stock risk and returns a JSON array of recommendations.

**Critical design rule:** The agent is called **once after the loop**, never inside it. This reduces API calls, cost, and latency.

### 4. Output Stage (Logic App → Blob Storage)

Four output files are written to the `output` container:

| File | Content | Written By |
|---|---|---|
| `forecast_output.json` | Enriched branch data (weather, forecast, stock) | `Compose_forecast_output` |
| `replenishment_output.json` | Agent recommendations (risk, reorder qty, explanation) | `Parse_agent_response` |
| `operator_summary.json` | Run metadata (run_id, timestamp, branches evaluated) | `Compose_operator_summary` |
| `workflow_runs.json` | Rolling history of last 20 runs | `Compose_updated_runs` |

### 5. Dashboard Stage (Blob Storage → Static Web App)

The frontend dashboard (vanilla HTML/JS) reads both input and output files directly from Blob Storage using public blob read access. The Azure Function provides runtime configuration (Maps key, blob base URLs) via `GET /api/config`.

### 6. Chat Stage (Dashboard → Function App → Azure OpenAI)

The operations chat assistant routes all queries through the Azure Function proxy (`POST /api/chat`). The function:

1. Receives the message array from the frontend
2. Adds the OpenAI API key server-side
3. Forwards to Azure OpenAI Chat Completions API
4. Returns the assistant's reply

This ensures **zero API keys exist in the frontend source code**.

---

## Security Architecture

| Concern | Mitigation |
|---|---|
| OpenAI API key exposure | Key stored only in Function App Settings; frontend calls `/api/chat` proxy |
| Azure Maps key exposure | Served via `/api/config` from Function App Settings; not in frontend source |
| Blob Storage access | Input/output containers use public blob read; no SAS tokens needed for reads |
| Logic App blob auth | Managed Service Identity (MSI) with Storage Blob Data Contributor role |
| Function App CORS | Configured to allow only the SWA domain and localhost |
| Chat message limits | Server-side cap of 30 messages per request to prevent abuse |

---

## Network Topology

```
                    Internet
                       │
          ┌────────────┼─────────────┐
          ▼            ▼             ▼
   ┌─────────────┐ ┌────────────┐ ┌────────────────┐
   │ User        │ │ Azure      │ │ Azure          │
   │ Browser     │ │ Portal     │ │ Logic App      │
   └──────┬──────┘ └────────────┘ │ (03:00 AM)     │
          │                       └───────┬────────┘
          │                               │
          ▼                               ▼
   ┌─────────────┐              ┌──────────────────┐
   │ Static Web  │─── CORS ───▶│ Function App     │
   │ App (CDN)   │             │ /api/chat         │
   │             │             │ /api/config        │
   └──────┬──────┘             └────────┬──────────┘
          │                             │
          ▼                             ▼
   ┌─────────────┐              ┌──────────────────┐
   │ Blob Storage│              │ Azure OpenAI     │
   │ (public     │              │ (api-key auth)   │
   │  blob read) │              └──────────────────┘
   └─────────────┘
```

---

## Technology Stack

| Layer | Technology | Version/Detail |
|---|---|---|
| **Orchestration** | Azure Logic Apps (Consumption) | ARM-deployed workflow (`Microsoft.Logic/workflows`) |
| **AI Model** | Azure OpenAI | GPT-4o (`gpt-4o`, GlobalStandard SKU) |
| **Weather** | Azure Maps Weather API | v1.1 daily forecast |
| **Storage** | Azure Blob Storage | REST API v2020-10-02 |
| **Frontend** | Vanilla HTML/CSS/JS | No build step |
| **Icons** | Lucide Icons | v0.344.0 (CDN) |
| **Charts** | Chart.js | v4.4.7 (CDN) |
| **Maps** | Azure Maps Web SDK | v3 (CDN) |
| **Font** | Inter | Google Fonts |
| **Design System** | Custom CSS tokens + components | Wesfarmers green `#00843D`, `design-tokens.css` + `premium-components.css` |
| **API Proxy** | Azure Functions | Node.js 20, Consumption plan |
| **Hosting** | Azure Static Web Apps | Free tier |

---

## File Structure

```
nightly-stock-planner/
├── api/                          # Azure Functions (API proxy)
│   ├── chat/                     # POST /api/chat → Azure OpenAI proxy
│   │   ├── function.json
│   │   └── index.js
│   ├── config/                   # GET /api/config → runtime config
│   │   ├── function.json
│   │   └── index.js
│   ├── host.json
│   └── package.json
│
├── input/                        # Seed data (uploaded to Blob Storage)
│   ├── branches.json             # 6 Australian stores
│   ├── sales_recent.json         # 30 days × 6 branches
│   ├── inventory_latest.json     # Current stock per branch
│   └── sku.json                  # Product: Pedestal Fan 40cm (EF001)
│
├── logicapps/
│   ├── nightly-stock-planner/
│   │   ├── workflow.json         # Logic App Standard definition (reference)
│   │   └── agent.json            # Agent configuration reference
│   └── consumption/
│       └── arm-template.json     # Consumption Logic App ARM template
│
├── styles/                       # Premium design system
│   ├── design-tokens.css         # CSS custom properties
│   └── premium-components.css    # Reusable component classes
│
├── webapp/                       # Static Web App (deployed)
│   ├── index.html                # Dashboard HTML
│   ├── app.js                    # Dashboard logic (~1600 lines)
│   ├── config.js                 # API endpoint URLs
│   ├── env.js                    # Runtime env (empty — no secrets)
│   ├── styles.css                # Dashboard CSS (Wesfarmers green, pipeline animation)
│   ├── styles/                   # Design system for deployment
│   │   ├── design-tokens.css     # CSS custom properties (palette, spacing, typography)
│   │   └── premium-components.css # Reusable component classes
│   └── output/                   # Local copies of workflow outputs
│
└── docs/                         # Documentation
    ├── reference/                # Architecture & functional docs
    ├── solution-brief.md
    ├── azure-setup-checklist.md
    └── deployment-checklist.md
```
