# Agentic Solution & Agent Loop Logic App

## 1. What Is an Agentic Solution?

An **agentic AI solution** is one where an AI model doesn't just respond to human prompts — it acts **autonomously** as part of a business process, making decisions and producing outputs without human intervention.

In contrast to a simple chatbot (which waits for a user to ask a question), an agentic workflow:

- **Runs on a schedule** (no human trigger required)
- **Gathers its own context** (reads data, calls APIs)
- **Reasons over structured inputs** (evaluates risk, computes recommendations)
- **Produces actionable outputs** (writes files, sends alerts)
- **Operates within guardrails** (deterministic pre-processing, structured prompts, validated schemas)

### Traditional AI vs Agentic AI

| Aspect | Traditional Chatbot | Agentic Workflow |
|---|---|---|
| Trigger | User sends a message | Timer, event, or webhook |
| Data access | User provides context | System gathers from multiple sources |
| Reasoning | Single-turn Q&A | Multi-step: gather → compute → reason → act |
| Output | Text reply to user | Structured decisions (JSON, database writes, notifications) |
| Human involvement | Required for every interaction | Autonomous; human reviews output |
| Frequency | On-demand | Scheduled (e.g. nightly at 03:00 AM) |

---

## 2. Our Agentic Architecture

This solution implements the agentic pattern using **Azure Logic Apps (Consumption)** as the orchestrator and **Azure OpenAI** as the reasoning engine.

### Two-Agent Design

The solution uses two distinct agents:

#### Agent 1: Nightly Replenishment Planner (Autonomous)

- **Type:** Autonomous (runs without human input)
- **Schedule:** Daily at 03:00 AM AEST
- **Workflow:** `nightly-stock-planner` (Logic App)
- **Purpose:** Evaluate stock risk for all 6 branches, recommend reorder quantities
- **Output:** JSON files written to Blob Storage

#### Agent 2: Operations Chat Assistant (Conversational)

- **Type:** Conversational (responds to human queries)
- **Interface:** Chat panel in the dashboard UI
- **Backend:** Azure Function proxy → Azure OpenAI
- **Purpose:** Answer operator questions about branch risk, stock, weather, and the latest nightly run
- **Context:** System prompt injected with current dashboard data (replenishment, forecast, inventory, run history)

---

## 3. Why Azure Logic Apps for Agentic Workflows?

Azure Logic Apps (Consumption) provides several advantages for building agentic solutions:

| Capability | Benefit |
|---|---|
| **Visual workflow designer** | Non-developers can understand and modify the flow |
| **Recurrence trigger** | Built-in scheduling without external CRON services |
| **HTTP actions** | Direct calls to any REST API (Weather, OpenAI, Blob Storage) |
| **Managed Service Identity** | Secure, keyless authentication to Azure resources |
| **Built-in variable management** | Array accumulation pattern (init → loop → append) |
| **Expression language** | Inline calculations (temperature uplift, string formatting) |
| **Run history & monitoring** | Full execution trace in Azure Portal |
| **Stateful execution** | Reliable, durable execution with automatic retries |

---

## 4. The Agent Loop — Step by Step

The "agent loop" refers to the complete cycle from data collection through AI reasoning to output generation. Below is the detailed walkthrough.

### 4.1 Overview Diagram

```
┌────────────────────────────────────────────────────────┐
│                   AGENT LOOP                            │
│                                                        │
│   ┌──────────┐                                         │
│   │ TRIGGER  │  03:00 AM AEST daily                    │
│   └────┬─────┘                                         │
│        │                                               │
│        ▼                                               │
│   ┌──────────┐                                         │
│   │ COLLECT  │  Read branches, sales, inventory        │
│   │          │  from Blob Storage (3 parallel reads)   │
│   └────┬─────┘                                         │
│        │                                               │
│        ▼                                               │
│   ┌──────────┐                                         │
│   │ ENRICH   │  For each branch:                       │
│   │          │  • Filter sales/inventory               │
│   │          │  • Call Weather API                      │
│   │          │  • Compute demand forecast               │
│   │          │  • Append to branchInputs               │
│   └────┬─────┘                                         │
│        │                                               │
│        ▼                                               │
│   ┌──────────┐                                         │
│   │ REASON   │  Send ALL branches to Azure OpenAI      │
│   │          │  in a single API call                   │
│   │          │  (Agent evaluates risk + recommends)    │
│   └────┬─────┘                                         │
│        │                                               │
│        ▼                                               │
│   ┌──────────┐                                         │
│   │   ACT    │  Write output files to Blob Storage     │
│   │          │  • forecast_output.json                  │
│   │          │  • replenishment_output.json             │
│   │          │  • operator_summary.json                 │
│   │          │  • workflow_runs.json                    │
│   └──────────┘                                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 4.2 Phase 1 — TRIGGER

**Action:** `Recurrence_03AM_Sydney`

```json
{
  "type": "Recurrence",
  "recurrence": {
    "frequency": "Day",
    "interval": 1,
    "schedule": { "hours": ["3"], "minutes": ["0"] },
    "timeZone": "AUS Eastern Standard Time"
  }
}
```

The workflow fires once per day. No human intervention is needed. A unique `runId` is generated: `run-YYYYMMDD-HHmmss`.

### 4.3 Phase 2 — COLLECT

Three HTTP GET actions run **in parallel** to read input files from Blob Storage:

| Action | Blob Path | Content |
|---|---|---|
| `Get_branches` → `Parse_branches` | `input/branches.json` | 6 store locations |
| `Get_sales_recent` → `Parse_sales` | `input/sales_recent.json` | 30 days of sales |
| `Get_inventory` → `Parse_inventory` | `input/inventory_latest.json` | Current stock snapshot |

All three use **Managed Service Identity** for authentication — no connection strings or API keys needed for blob access.

### 4.4 Phase 3 — ENRICH (The For Each Loop)

**Action:** `For_each_branch`

Iterates over the 6 parsed branch objects. **Concurrency is set to 1** (sequential) to avoid race conditions on the `branchInputs` array variable.

For each branch, the following actions execute:

```
For_each_branch
├── Filter_sales_for_branch          ← Query: sales where branch_id matches
├── Filter_inventory_for_branch      ← Query: inventory where branch_id matches
├── compose_stock_on_hand            ← Extract stock_on_hand (or 0 if missing)
├── Compose_in_transit               ← Extract in_transit (or 0 if missing)
├── Compose_safety_stock             ← Extract safety_stock (or 0 if missing)
├── HTTP_Get_Weather                 ← Azure Maps: tomorrow's forecast for lat/lon
├── compose_maxTemp                  ← Extract forecasts[0].temperature.maximum.value
├── compose_weather_condition        ← Extract forecasts[0].day.shortPhrase
├── Compose_avg7_value               ← Extract avg_daily_sales from inventory
├── Compose_predicted_units          ← Deterministic: avg7 × uplift
└── Append_to_branchInputs           ← Add enriched object to array
```

#### The Demand Forecast Calculation

This is a critical design decision: the demand forecast is computed **deterministically by the Logic App**, not by the AI model. This ensures:

- **Reproducibility** — same inputs always produce the same forecast
- **Auditability** — the calculation is visible in the workflow definition
- **Trust** — the AI model reasons over known numbers, not its own guesses

The Logic App expression:

```
@if(
  greater(float(outputs('compose_maxTemp')), 30),
  mul(float(string(outputs('Compose_avg7_value'))), 1.22),
  if(
    greaterOrEquals(float(outputs('compose_maxTemp')), 27),
    mul(float(string(outputs('Compose_avg7_value'))), 1.12),
    float(string(outputs('Compose_avg7_value')))
  )
)
```

Translation:
- If max temp > 30°C → multiply 7-day average by 1.22 (22% uplift)
- Else if max temp ≥ 27°C → multiply by 1.12 (12% uplift)
- Else → use the 7-day average as-is

### 4.5 Phase 4 — REASON (The Agent Call)

**Action:** `Agent_Replenishment_Planner`

After the loop completes, all 6 enriched branch objects are in the `branchInputs` array. A single HTTP POST sends them to Azure OpenAI:

```
POST {OPENAI_ENDPOINT}/openai/deployments/{DEPLOYMENT}/chat/completions
    ?api-version=2024-08-01-preview

Headers:
  Content-Type: application/json
  api-key: {OPENAI_API_KEY}

Body:
{
  "messages": [
    { "role": "system", "content": "<system prompt>" },
    { "role": "user", "content": "Evaluate the following branches...\n\n<branchInputs as JSON>" }
  ],
  "temperature": 0.2,
  "max_tokens": 4000
}
```

#### Why One Call, Not Six?

The agent processes **all branches in a single API call** rather than being called once per branch. This is a critical architectural rule:

| Approach | API Calls | Cost | Latency | Consistency |
|---|---|---|---|---|
| Agent inside loop (WRONG) | 6 | 6× higher | 6× slower | Risk of inconsistent reasoning |
| Agent after loop (CORRECT) | 1 | 1× | 1× | Single coherent evaluation |

#### The System Prompt

The system prompt defines the agent's complete decision framework:

**Role definition:**
> You are a replenishment planning agent for WesOnline, an Australian electronics retailer operating 6 stores. The primary product is the Pedestal Electric Fan 40cm (SKU: EF001).

**Input format:** Describes exactly which fields the agent receives and their types.

**Decision logic:**
```
available_stock = stock_on_hand + in_transit
stock_gap       = baseline_forecast_units - available_stock
safety_buffer   = available_stock - safety_stock

HIGH:   stock_gap > 0  AND  safety_buffer < 20
MEDIUM: stock_gap > 0  BUT  safety_buffer >= 20
    OR  stock_gap <= 0 BUT  safety_buffer < 10
LOW:    Adequate coverage with safety margin
```

**Reorder rules:**
- HIGH → round gap up to next multiple of 10, minimum 20
- MEDIUM → round gap up to next multiple of 10, minimum 10
- LOW → 0

**Guardrails:**
- Be conservative, do not over-order
- Always use the provided `baseline_forecast_units` — never invent demand
- Quantities must be multiples of 10
- Mention temperature and stock in every explanation
- Keep explanations to 1-2 sentences

**Output format:** Pure JSON array, no markdown, no commentary.

#### Agent Response Example

```json
[
  {
    "branch_id": "BR001",
    "branch_name": "Sydney WesOnline",
    "city": "Sydney",
    "risk_level": "High",
    "reorder_needed": true,
    "recommended_order_qty": 30,
    "confidence": "High",
    "explanation": "With a forecasted 30.5°C day, fan demand will be strong at ~39 units, but only 12 on hand versus a gap of 27; urgent reorder needed."
  },
  {
    "branch_id": "BR002",
    "branch_name": "Melbourne WesOnline",
    "city": "Melbourne",
    "risk_level": "Low",
    "reorder_needed": false,
    "recommended_order_qty": 0,
    "confidence": "High",
    "explanation": "Mild 24.2°C weather keeps fan demand at 22 units, well within 36 available (28 + 8 in transit)."
  }
]
```

### 4.6 Phase 5 — ACT (Write Outputs)

After parsing the agent response, the workflow writes four files to Blob Storage in parallel:

| Action | Output File | Content |
|---|---|---|
| `Write_forecast_output` | `output/forecast_output.json` | Enriched branch data (input to agent) |
| `Write_replenishment_output` | `output/replenishment_output.json` | Agent recommendations |
| `Write_operator_summary` | `output/operator_summary.json` | Run metadata |
| `Write_workflow_runs` | `output/workflow_runs.json` | Updated run history (last 20) |

The run history uses a **rolling window** pattern:
```
new_runs = [current_run] + existing_runs[0:19]
```

This keeps the file bounded while preserving recent history.

---

## 5. Logic App Workflow Actions — Complete Reference

Below is the complete action dependency graph:

```
Recurrence_03AM_Sydney
│
├── Initialize_branchInputs
│   └── Initialize_runId
│       ├── Get_branches → Parse_branches ──┐
│       ├── Get_sales_recent → Parse_sales ──┤ (all 3 wait for runId)
│       └── Get_inventory → Parse_inventory ─┘
│                                            │
│                       ┌────────────────────┘
│                       ▼
│               For_each_branch (sequential, concurrency=1)
│               │
│               ├── Filter_sales_for_branch
│               ├── Filter_inventory_for_branch
│               ├── compose_stock_on_hand
│               ├── Compose_in_transit
│               ├── Compose_safety_stock
│               ├── HTTP_Get_Weather
│               │   ├── compose_maxTemp
│               │   └── compose_weather_condition
│               ├── Compose_avg7_value
│               ├── Compose_predicted_units (depends on avg7 + maxTemp)
│               └── Append_to_branchInputs (depends on all above)
│
├── Compose_forecast_output (after loop)
│
├── Agent_Replenishment_Planner (after Compose_forecast_output)
│
├── Parse_agent_response (after Agent)
│   │
│   ├── Write_forecast_output          (parallel)
│   ├── Write_replenishment_output     (parallel)
│   ├── Compose_operator_summary
│   │   └── Write_operator_summary
│   └── Read_existing_workflow_runs
│       └── Compose_existing_runs
│           └── Compose_new_run_entry
│               └── Compose_updated_runs
│                   └── Write_workflow_runs
```

---

## 6. Agent Configuration File (agent.json)

The `agent.json` file is a **reference/documentation file** — it is not deployed to or consumed by Azure. It describes the agent's contract in a structured format.

```json
{
  "agent": {
    "name": "nightly-replenishment-planner",
    "type": "autonomous",
    "model": {
      "provider": "AzureOpenAI",
      "deployment": "gpt-4o",
      "parameters": {
        "temperature": 0.2,
        "max_tokens": 2000,
        "response_format": "json_object"
      }
    },
    "systemPrompt": "...(full prompt)...",
    "userPromptTemplate": "Evaluate the following branches...\n\n{{branchInputs}}",
    "inputBinding": {
      "branchInputs": "@string(variables('branchInputs'))"
    },
    "outputSchema": {
      "type": "array",
      "items": { ... }
    }
  }
}
```

### Key Properties

| Property | Purpose |
|---|---|
| `type: autonomous` | Indicates no human trigger needed |
| `temperature: 0.2` | Low randomness for consistent, conservative decisions |
| `response_format: json_object` | Instructs the model to return valid JSON |
| `systemPrompt` | Complete decision framework and guardrails |
| `userPromptTemplate` | Template with `{{branchInputs}}` placeholder |
| `inputBinding` | Maps Logic App variable to template placeholder |
| `outputSchema` | JSON Schema for validating the agent's response |

---

## 7. Guardrails and Responsible AI

The solution implements several guardrails to ensure reliable, trustworthy agent behaviour:

### Deterministic Pre-Processing

The demand forecast is computed by the Logic App **before** the agent receives the data. The agent cannot invent or modify the baseline prediction. It can only reason over what it's given.

### Structured Prompt Engineering

The system prompt includes:
- Explicit calculation formulas
- Exact field names and types
- Risk classification rules with thresholds
- Output format requirements
- Constraints (multiples of 10, conservative ordering)

### Output Validation

The agent's response is parsed through a `Parse JSON` action with a strict schema. If the response doesn't match (e.g. missing fields, wrong types), the workflow fails with a clear error.

### Temperature Control

`temperature: 0.2` produces highly deterministic outputs. Given the same inputs, the agent will return nearly identical recommendations across runs.

### Human Review Layer

All output is written to Blob Storage for human review before any action is taken. The dashboard provides visibility into every recommendation, and the chat assistant explains the reasoning. No automated purchasing or stock movement occurs.

### Audit Trail

Every run is recorded in `workflow_runs.json` with a direct link to the Azure Portal run history, where every action's inputs and outputs are inspectable.

---

## 8. Operations Chat Agent — How It Works

The conversational agent uses a "context stuffing" approach (also known as "poor man's RAG"):

### Architecture

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│ Dashboard │────▶│ Azure        │────▶│ Azure OpenAI    │
│ Chat UI   │    │ Function App │    │ GPT-4o          │
│           │◀───│ /api/chat    │◀───│                  │
└──────────┘     └──────────────┘     └─────────────────┘
```

### How Context Is Built

When a user sends a message, the frontend builds a **system prompt** containing:

1. **Replenishment summary** — all branches with risk, qty, confidence, explanation
2. **Forecast summary** — branch, temp, weather, avg7, predicted, stock, in-transit, safety
3. **Inventory summary** — on-hand, in-transit, safety per branch
4. **Last workflow run** — run_id, status, timestamp, duration, branches, flagged count
5. **Operator summary** — generated_at, run_id, summary text

This entire context is injected into the system message on every request. There is no vector store, no embeddings, no retrieval index — the data fits within the model's context window.

### Why This Approach Works for a Demo

| Factor | Assessment |
|---|---|
| Data volume | Small (6 branches, ~20 data points each) |
| Total tokens | ~1,500-2,000 tokens of context |
| Model context window | 128K+ tokens (GPT-4o) |
| Freshness | Always uses latest data from blob storage |
| Complexity | Zero infrastructure beyond the Function App |

For a production system with thousands of branches, you would introduce Azure AI Search with vector embeddings. For a 6-branch demo, context stuffing is simpler and equally effective.

### Chat Safety Measures

- **Message cap:** Server-side limit of 30 messages per request
- **API key isolation:** Key exists only in Function App Settings
- **CORS**: Function App allows only the SWA domain and localhost
- **Fallback:** Local keyword-matching engine when OpenAI is unavailable

---

## 9. Comparison: This Solution vs Enterprise Production

| Aspect | This Demo | Production Scale |
|---|---|---|
| Branches | 6 | Hundreds to thousands |
| SKUs | 1 (EF001) | Full product catalogue |
| Data store | Blob Storage (JSON files) | Azure SQL / Cosmos DB |
| Forecast model | Rule-based (temperature uplift) | ML model (Prophet, ARIMA, neural) |
| Agent call | Single HTTP to OpenAI | Agent framework with tools, memory, retry |
| Chat context | System prompt injection | Azure AI Search + RAG pipeline |
| Notifications | None (output files only) | Teams/email/SMS alerts |
| Approval workflow | Manual review | Automated with human-in-the-loop gates |
| Deployment | Manual CLI | CI/CD with GitHub Actions |
| Monitoring | Azure Portal run history | Application Insights + dashboards |

The demo demonstrates the **pattern** of agentic decision-making. Scaling to production involves swapping components, not changing the architecture.

---

## 10. Key Design Decisions Explained

### Why Logic Apps instead of Azure Functions for orchestration?

Logic Apps provides a visual, stateful workflow engine with built-in retry, run history, and portal monitoring. For agentic workflows that follow a predictable sequence (collect → enrich → reason → act), the low-code approach is faster to build and easier to demo than procedural code.

### Why not use a LangChain/Semantic Kernel agent?

Code-first agent frameworks are powerful for complex multi-tool scenarios, but they require:
- A runtime host (App Service, Container App, or Functions)
- Custom orchestration code
- Custom logging and retry logic

Logic Apps provides all of this out of the box. For a demo with a predictable workflow and a single reasoning step, the Logic App approach is simpler and more visual.

### Why is the forecast formula in the Logic App, not the AI model?

Separating deterministic computation from AI reasoning is a **responsible AI best practice**:
- The formula is auditable and version-controlled
- The AI model can't hallucinate demand numbers
- The model focuses on what it's best at: evaluating risk and generating explanations

### Why one agent call instead of per-branch calls?

- **Cost:** 1 API call vs 6
- **Latency:** ~2-3 seconds vs ~15-18 seconds
- **Consistency:** The agent sees all branches simultaneously and can compare relative risk
- **Simplicity:** One parse action, one output array
