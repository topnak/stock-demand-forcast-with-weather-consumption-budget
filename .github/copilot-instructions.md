# GitHub Copilot Instructions for Southern Scoops Agentic Replenishment Demo

You are helping build an Azure-based retail demo for **Southern Scoops Ice Cream Co.**

## Solution goal

Build an **agentic demand forecasting and stock replenishment demo** for an Australian ice cream retailer.

The solution must use:

- **Azure Logic Apps Standard**
- **Autonomous Agent workflow** for nightly planning
- **Conversational Agent workflow** for operator Q&A
- **Azure Blob Storage** for input and output JSON files
- **Azure Maps Weather API** for real weather forecast
- **Azure Static Web App** for dashboard and mobile-friendly UI
- **Azure OpenAI** for the agent reasoning step

Do not design this as a large enterprise system with unnecessary services unless explicitly requested.
Prefer the **minimum viable architecture** that is demo-friendly, visually impressive, and easy to deploy.

---

## Business scenario

The company is **Southern Scoops Ice Cream Co.**

The demo predicts whether each branch will need more stock tomorrow based on:

- recent sales
- current stock
- in-transit stock
- safety stock
- tomorrow weather forecast
- simple baseline demand forecast

The main product is:

- `IC001`
- `Classic Vanilla Ice Cream Tub 500ml`
- currency: `AUD`

Branch cities are in Australia and should use realistic Australian naming and geography.

---

## Architecture rules

Always follow these design rules:

### 1. Use two agents
Build two workflows in Azure Logic Apps Standard:

#### Workflow 1: `nightly-stock-planner`
Type:
- autonomous agent workflow

Purpose:
- runs at 03:00 AM Australia/Sydney
- retrieves weather forecast
- reads inventory and recent sales
- calculates baseline demand forecast
- sends branch data to the agent
- receives reorder recommendations
- writes output JSON files
- optionally sends operator summary

#### Workflow 2: `operations-chat-agent`
Type:
- conversational agent workflow

Purpose:
- reads the latest output JSON files
- answers operator questions
- explains why a branch is high risk
- summarizes tomorrow’s conditions

### 2. Agent must NOT run inside a For each loop
This is critical.

The Logic App agent action must run **after** the loop.

Correct pattern:

- loop through branches
- prepare branch payloads
- append them into an array variable such as `branchInputs`
- run the Agent once after the loop
- pass `branchInputs` into the Agent

Never place the Agent action inside a `For each`.

### 3. Weather call must be deterministic
Never ask the LLM to invent weather.

Use Azure Maps Weather API through an HTTP action.

Use the endpoint:

`https://atlas.microsoft.com/weather/forecast/daily/json`

Expected query parameters:
- `api-version=1.1`
- `query=latitude,longitude`
- `duration=1`
- `subscription-key=<maps key>`

### 4. Use deterministic baseline math before the agent
The baseline demand forecast must be calculated using workflow logic, not invented by the model.

Baseline forecast logic:
- if temperature > 30C, uplift by 22%
- else if temperature >= 27C, uplift by 12%
- else no uplift

Formula:
- `predicted_units = avg7 * uplift`

The agent then reasons over:
- baseline forecast
- stock situation
- branch context
- weather context

### 5. Use Blob Storage JSON files
Use Blob Storage instead of SQL for the demo unless explicitly asked to use SQL.

Use containers:
- `input`
- `output`

Input files:
- `branches.json`
- `sales_recent.json`
- `inventory_latest.json`
- `sku.json`

Output files:
- `forecast_output.json`
- `replenishment_output.json`
- `operator_summary.json`
- `workflow_runs.json`
- `workflow_steps.json`

### 6. Web UI must be Microsoft-style
The dashboard must look clean and modern, inspired by Microsoft and Azure design patterns:
- white background
- subtle grey surfaces
- blue accent color
- rounded cards
- Segoe UI or close equivalent
- mobile responsive
- executive-friendly

Do not make the UI look like a generic startup SaaS template.

---

## Logic App workflow design guidance

When generating Logic App JSON or portal step guidance, follow this shape:

### Nightly workflow structure

1. `Recurrence`
2. `get branches`
3. `get sales recent`
4. `get inventory`
5. `Initialize branchInputs`
6. `For_each_branch`
   - filter sales for branch
   - filter inventory for branch
   - call Azure Maps weather
   - compose stock values
   - compose avg7
   - compose max temperature
   - compose weather condition
   - compose predicted units
   - append object to `branchInputs`
7. `Agent`
8. `Parse JSON`
9. `Create output blobs`

### Important workflow constraints
- `For each` must receive a parsed array
- blob content may need `base64ToString(...)` before `Parse JSON`
- HTTP weather action must not reference itself
- agent must not reference `items('For_each_branch')`
- agent must use `variables('branchInputs')`

### Common variable names
Use these names consistently:
- `branchInputs`
- `runId`
- `flaggedBranches`
- `totalRecommendedQty`

### Common compose/action names
Prefer stable names such as:
- `compose_stock_on_hand`
- `Compose_in_transit`
- `Compose_safety_stock`
- `compose_avg7`
- `compose_maxTemp`
- `compose_weather_condition`
- `Compose_predicted_units`

Use consistent naming because Logic App expressions depend on exact action names.

---

## Agent prompt design guidance

### Nightly autonomous agent
The agent should evaluate multiple branches at once from `branchInputs`.

System prompt must:
- define the role as replenishment planning agent
- explain that it receives a list of branches
- require JSON array output only
- require:
  - `branch_id`
  - `branch_name`
  - `city`
  - `risk_level`
  - `reorder_needed`
  - `recommended_order_qty`
  - `confidence`
  - `explanation`

The agent should:
- be conservative
- avoid inventing values
- use the provided baseline forecast
- recommend order quantities in multiples of 10
- explain weather and demand impact

### Conversational agent
The chat agent must:
- answer based on latest output files
- not invent branch data
- summarize current risk
- explain prior recommendations
- describe latest 03:00 AM run
- use concise business language

---

## Data design guidance

Use realistic Australian dummy data.

### Branch design
Use 6 branches in major Australian cities:
- Sydney
- Melbourne
- Brisbane
- Perth
- Adelaide
- Gold Coast

Example branch names:
- Sydney Harbour Scoops
- Melbourne Laneway Scoops
- Brisbane River Scoops
- Perth Sunset Scoops
- Adelaide Market Scoops
- Gold Coast Beach Scoops

### Product design
Single SKU for the first demo:
- `IC001`
- `Classic Vanilla Ice Cream Tub 500ml`
- `AUD 7.50`

### Weather realism
Use Celsius and Australian-style weather expectations.

### Sales realism
Patterns should reflect:
- hotter cities with stronger demand
- weekend uplift
- tourist uplift in Gold Coast and Sydney
- moderate demand in Melbourne
- realistic stock pressure

---

## Code generation guidance

When generating code, prioritize:

### For Logic Apps
- clean workflow JSON
- expressions that are valid in Logic Apps
- explicit notes on where to replace placeholder values
- avoid referencing loop-scoped values outside loops
- avoid self-referencing HTTP actions

### For Static Web App
Prefer:
- HTML/CSS/JavaScript or lightweight React
- Azure Maps Web SDK
- Chart.js
- responsive layout
- mobile-friendly design

### For output JSON
Keep files simple and web-friendly.

Example `replenishment_output.json` structure:
```json
[
  {
    "branch_id": "BR001",
    "branch_name": "Sydney Harbour Scoops",
    "city": "Sydney",
    "risk_level": "High",
    "reorder_needed": true,
    "recommended_order_qty": 60,
    "confidence": "High",
    "explanation": "Sydney forecast temperature of 31°C and strong recent sales indicate demand will exceed available stock."
  }
]