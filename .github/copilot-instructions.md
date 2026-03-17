# GitHub Copilot Instructions for WesOnline Agentic Replenishment Demo

You are helping build an Azure-based retail demo for **WesOnline**, an Australian electronics retailer.

## Solution goal

Build an **agentic demand forecasting and stock replenishment demo** for an Australian electronics retailer.

The solution must use:

- **Azure Logic Apps (Consumption)**
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

The company is **WesOnline**, an Australian electronics retailer.

The demo predicts whether each branch will need more stock tomorrow based on:

- recent sales
- current stock
- in-transit stock
- safety stock
- tomorrow weather forecast
- simple baseline demand forecast

The main product is:

- `EF001`
- `Pedestal Electric Fan 40cm`
- currency: `AUD`

Branch cities are in Australia and should use realistic Australian naming and geography.

---

## Architecture rules

Always follow these design rules:

### 1. Use two agents
Build two workflows in Azure Logic Apps (Consumption):

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
- Sydney WesOnline
- Melbourne WesOnline
- Brisbane WesOnline
- Perth WesOnline
- Adelaide WesOnline
- Gold Coast WesOnline

### Product design
Single SKU for the first demo:
- `EF001`
- `Pedestal Electric Fan 40cm`
- `AUD 89.00`

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
    "branch_name": "Sydney WesOnline",
    "city": "Sydney",
    "risk_level": "High",
    "reorder_needed": true,
    "recommended_order_qty": 30,
    "confidence": "High",
    "explanation": "Sydney forecast temperature of 31°C and strong recent sales indicate fan demand will exceed available stock."
  }
]



# UI / Design System Rules

You are redesigning an enterprise dashboard called "WesOnline-Demo".

Goal:
Create a professional, modern, responsive enterprise dashboard for an AI-powered replenishment system. The design must feel polished, credible, and boardroom-ready — not experimental, playful, or “vibe coded”.

Brand direction:
- Visual tone inspired by the corporate feel of Wesfarmers: restrained, confident, clean, high-trust
- Use a deep corporate blue as the primary brand color
- Use white and soft neutral backgrounds
- Use accent colors sparingly for status only
- Avoid bright gradients, neon colors, glossy effects, oversized shadows, or toy-like illustrations

Product naming:
- Rename the product from "Southern Scoops" to "WesOnline-Demo"
- Update title, navbar, metadata, and all visible labels consistently

Design principles:
- Enterprise UX first
- Strong information hierarchy
- Generous whitespace
- Clear typography scale
- Consistent 8px spacing system
- Subtle borders and restrained shadows
- Clean card layout with clear section grouping
- Responsive at mobile, tablet, laptop, and widescreen breakpoints
- Accessibility-compliant contrast and focus states

Layout requirements:
- Responsive dashboard with a clean top header and content grid
- On desktop: prioritize summary KPIs, recommendations, charts, and workflow status in a balanced layout
- On tablet: stack sections logically without shrinking content too aggressively
- On mobile: convert multi-column layout into a single-column flow with collapsible or tabbed sections where appropriate
- Recommendations panel must remain readable and usable on smaller screens
- Charts should resize gracefully and maintain legibility
- Avoid fixed pixel widths where possible; prefer fluid layout with sensible max-widths

Visual style:
- No cartoonish, emoji-like, or mismatched icons
- Use one professional icon set only, such as Lucide, Heroicons, or Material Symbols
- Icons must be line-based or clean duotone, minimal, and consistent in stroke weight
- Avoid random icon colors; icons should inherit semantic or neutral color roles
- Use subtle hover, active, and selected states
- Use rounded corners conservatively
- Prefer clarity over decorative elements

Components:
- Header with product name: WesScoops
- KPI cards with strong numeric emphasis and concise labels
- Store status and replenishment recommendations with clean severity badges
- Chart cards with simplified legends and cleaner axis labels
- Workflow timeline shown as an enterprise activity log, not as decorative pills
- Replace any placeholder or unfinished map behavior with either:
  1. a polished static store overview component, or
  2. a proper interactive map only if fully supported

Status system:
- Use semantic colors only for status:
  - low risk / healthy = muted green
  - medium attention = amber
  - high risk = red
  - informational = blue/neutral
- Never use color alone; pair with text labels and icons

Typography:
- Use a clean sans-serif suitable for enterprise UI
- Strong page title
- Quiet secondary labels
- Avoid all-caps except very small metadata labels if needed
- Ensure readable font sizes on mobile

Implementation requirements:
- Refactor the UI into reusable components
- Create a small design token system for colors, spacing, radius, border, shadow, and typography
- Use CSS variables or theme tokens
- Ensure dark mode is optional only if it can be done properly; otherwise ship a polished light theme first
- Remove visual clutter and placeholder-looking UI
- Do not generate novelty design elements

Output requirements:
- First provide:
  1. design rationale
  2. color token proposal
  3. typography scale
  4. responsive layout plan
  5. icon system choice
- Then generate the updated production-ready UI code
- Finally, list what was changed to make the product look more enterprise-grade