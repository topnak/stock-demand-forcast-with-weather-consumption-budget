# Functional Specification

## 1. Business Context

**WesOnline** is an Australian electronics retailer operating 6 stores across major cities. The primary product for this demo is the **Pedestal Electric Fan 40cm** (SKU: EF001, AUD $89.00).

Fan demand is **highly sensitive to temperature** — hotter days drive significantly more sales. Store managers traditionally review stock, sales trends, and weather manually to decide whether to reorder. This process is inconsistent and time-consuming.

The solution automates this nightly decision using an **AI-powered agentic workflow**.

---

## 2. Branch Network

| Branch ID | Name | City | State | Store Type | Latitude | Longitude |
|---|---|---|---|---|---|---|
| BR001 | Sydney WesOnline | Sydney | NSW | Flagship | -33.8688 | 151.2093 |
| BR002 | Melbourne WesOnline | Melbourne | VIC | Urban | -37.8136 | 144.9631 |
| BR003 | Brisbane WesOnline | Brisbane | QLD | Urban | -27.4698 | 153.0251 |
| BR004 | Perth WesOnline | Perth | WA | Suburban | -31.9505 | 115.8605 |
| BR005 | Adelaide WesOnline | Adelaide | SA | Suburban | -34.9285 | 138.6007 |
| BR006 | Gold Coast WesOnline | Gold Coast | QLD | Tourist | -28.0167 | 153.4000 |

---

## 3. Product Catalogue

| Field | Value |
|---|---|
| SKU | EF001 |
| Name | Pedestal Electric Fan 40cm |
| Category | Cooling Appliances |
| Price | AUD $89.00 |
| Unit of Measure | Unit |
| Weight | 4,200g |
| Storage | Warehouse |

---

## 4. Nightly Workflow — Functional Overview

### Trigger

The workflow runs automatically at **03:00 AM AEST** (AUS Eastern Standard Time) every day via a Recurrence trigger.

### Step-by-Step Process

#### Step 1: Initialise Run

- Generate a unique `runId` in the format `run-YYYYMMDD-HHmmss`
- Initialise an empty `branchInputs` array to collect enriched data

#### Step 2: Load Input Data

Three files are read in parallel from Azure Blob Storage (`input` container):

| File | Purpose |
|---|---|
| `branches.json` | Store locations, names, coordinates |
| `sales_recent.json` | Last 30 days of daily sales per branch |
| `inventory_latest.json` | Current stock, in-transit, safety stock, 7-day avg sales |

Each file is parsed into a typed JSON array for downstream use.

#### Step 3: Enrich Each Branch

For each of the 6 branches (processed sequentially):

**a) Filter Data**
- Filter `sales_recent` records matching the current branch
- Filter `inventory_latest` records matching the current branch

**b) Extract Stock Position**
- `stock_on_hand` — physical stock in the store
- `in_transit` — units already ordered and en route
- `safety_stock` — minimum buffer the branch should maintain

**c) Get Weather Forecast**
Call Azure Maps Weather API with the branch's latitude/longitude:
- Endpoint: `https://atlas.microsoft.com/weather/forecast/daily/json`
- Duration: 1 day (tomorrow only)
- Extract: `tomorrow_max_temp_c` and `weather_condition` (short phrase)

**d) Compute Baseline Demand Forecast**

The demand forecast is **deterministic** — calculated by workflow logic, not the AI model:

```
avg7 = 7-day average daily sales (from inventory_latest.json)

IF tomorrow_max_temp > 30°C:
    predicted_units = avg7 × 1.22   (+22% uplift)
ELIF tomorrow_max_temp >= 27°C:
    predicted_units = avg7 × 1.12   (+12% uplift)
ELSE:
    predicted_units = avg7 × 1.0    (no uplift)
```

**e) Append to branchInputs**

The enriched branch object is appended to the `branchInputs` array:

```json
{
  "branch_id": "BR001",
  "branch_name": "Sydney WesOnline",
  "city": "Sydney",
  "latitude": -33.8688,
  "longitude": 151.2093,
  "stock_on_hand": 12,
  "in_transit": 0,
  "safety_stock": 10,
  "recent_7_day_avg_sales": 32.1,
  "tomorrow_max_temp_c": 30.5,
  "weather_condition": "Warm; breezy this afternoon",
  "baseline_forecast_units": 39.162
}
```

#### Step 4: AI Agent Evaluation

After all 6 branches are enriched, the full `branchInputs` array is sent to Azure OpenAI in a single API call. The agent evaluates each branch's stock risk and returns recommendations.

See [03-agentic-solution.md](03-agentic-solution.md) for detailed agent logic.

#### Step 5: Parse Agent Response

The agent's JSON response is parsed and validated against the expected schema (array of recommendation objects).

#### Step 6: Generate Run Metadata

- `operator_summary.json` — run timestamp, run_id, branches evaluated
- `workflow_runs.json` — updated rolling history (last 20 runs)

#### Step 7: Write Output Files

Four output files are written in parallel to Azure Blob Storage (`output` container):

| File | Content |
|---|---|
| `forecast_output.json` | Enriched branch data with weather and demand forecast |
| `replenishment_output.json` | Agent recommendations per branch |
| `operator_summary.json` | Run-level metadata |
| `workflow_runs.json` | Rolling run history (last 20) |

---

## 5. Output Data Schemas

### forecast_output.json

Each record represents one branch's enriched data for tomorrow:

| Field | Type | Description |
|---|---|---|
| `branch_id` | string | e.g. "BR001" |
| `branch_name` | string | e.g. "Sydney WesOnline" |
| `city` | string | e.g. "Sydney" |
| `latitude` | number | Branch latitude |
| `longitude` | number | Branch longitude |
| `stock_on_hand` | integer | Current physical stock |
| `in_transit` | integer | Stock en route |
| `safety_stock` | integer | Minimum buffer policy |
| `recent_7_day_avg_sales` | number | 7-day rolling average |
| `tomorrow_max_temp_c` | number | Forecast high °C |
| `weather_condition` | string | e.g. "Sunny" |
| `baseline_forecast_units` | number | Deterministic demand prediction |

### replenishment_output.json

Each record represents the agent's recommendation for one branch:

| Field | Type | Description |
|---|---|---|
| `branch_id` | string | Branch identifier |
| `branch_name` | string | Full branch name |
| `city` | string | City name |
| `risk_level` | enum | "High", "Medium", or "Low" |
| `reorder_needed` | boolean | Whether reorder is recommended |
| `recommended_order_qty` | integer | Units to order (multiples of 10) |
| `confidence` | enum | "High", "Medium", or "Low" |
| `explanation` | string | 1-2 sentence justification |

### operator_summary.json

| Field | Type | Description |
|---|---|---|
| `generated_at` | string (ISO 8601) | Run completion timestamp |
| `run_id` | string | Unique run identifier |
| `branches_evaluated` | string | Number of branches processed |
| `total_recommended_qty` | integer | Sum of all reorder quantities |
| `summary` | string | Human-readable summary |

### workflow_runs.json

Array of up to 20 run entries:

| Field | Type | Description |
|---|---|---|
| `run_id` | string | Unique run identifier |
| `logic_app_run_id` | string | Azure Logic App run ID |
| `started_at` | string (ISO 8601) | Run start timestamp |
| `status` | string | "Succeeded" or "Failed" |
| `branches_evaluated` | integer | Number of branches processed |
| `flagged_branches` | integer | Number flagged for reorder |
| `portal_url` | string | Direct link to Azure Portal run view |

---

## 6. Dashboard Functional Specification

The dashboard uses a **Wesfarmers corporate green** (`#00843D`) design system with Inter font, CSS custom properties (`design-tokens.css`), and an 8px spacing grid. It is responsive across mobile, tablet, and desktop.

### 6.0 Headline KPI Card

A prominent card at the top showing:
- AI-generated insight summary (deterministic text synthesis from forecast + replenishment data)
- Risk distribution bar (visual segments for High/Medium/Low branches)
- Weather chips showing temperature per city
- Scrolling news ticker with key operational highlights

### 6.1 Compact KPI Tiles

Five uniform compact tiles displayed in a balanced 5-column grid (3-col on tablet, 2-col on mobile):

| Tile | Data Source | Calculation | Tooltip |
|---|---|---|---|
| **Branches** | `branches.json` | Count of records | Number of active store branches in tonight's run |
| **High Risk** | `replenishment_output.json` | Count where `risk_level === "High"` | Branches where stock may not meet tomorrow's demand |
| **Reorder Units** | `replenishment_output.json` | Sum of `recommended_order_qty` | Total units the AI recommends ordering |
| **Total Predicted** | `forecast_output.json` | Sum of `baseline_forecast_units` | Total predicted demand across all branches |
| **Avg Temp** | `forecast_output.json` | Average of `tomorrow_max_temp_c` | Average forecast high temperature across all cities |

### 6.2 Interactive Map

- **Technology:** Azure Maps Web SDK v3
- **Pins:** One per branch, coloured by risk level:
  - Red = High risk
  - Orange = Medium risk
  - Green = Low risk
- **Hover popup:** Shows branch name, stock on hand, in-transit, predicted demand, reorder qty, temperature, and weather condition
- **Fallback:** When Azure Maps key is unavailable, displays an HTML list of branches with coloured dots

### 6.3 Recommendations Panel

Sorted by risk level (High → Medium → Low). Each card shows:

- Branch name and city (with temperature in subtitle)
- Risk level badge (colour-coded)
- 4-metric grid:
  - **On Hand** — current stock
  - **Last Day Sold** — most recent day's sales from `sales_recent.json`
  - **Predicted** — baseline forecast (from `forecast_output.json`)
  - **Reorder Qty** — recommended order (highlighted with reorder bar)
- Inline AI explanation text directly in the reorder bar with sparkles icon
- Carousel navigation with prev/next buttons on mobile

### 6.4 Sales Trend Chart

- **Type:** Line chart (Chart.js)
- **Period:** Last 14 days
- **Series:** One line per branch (6 lines)
- **Colours:** Corporate colour palette (blue, navy, green, red, amber, teal)

### 6.5 Inventory Overview Chart

- **Type:** Stacked bar + line overlay (Chart.js)
- **X-axis:** Branch names
- **Bar segments:** Stock On Hand (green), In Transit (purple), Safety Stock (grey)
- **Line overlay:** Predicted Demand (red)
- **Purpose:** Visual comparison of available stock vs anticipated demand

### 6.6 Animated Workflow Pipeline

- **Data:** `workflow_steps.json` (7 phases from latest run)
- **Phases:** Load Branches → Load Sales → Load Inventory → Weather Forecasts → Demand Calculation → Agent Decision → Write Outputs
- **Animation:** Sequential step-by-step: pending (grey) → running (blue pulse) → success (green) / failed (red)
- **Connectors:** Animated fill lines between steps
- **Replay:** Button to replay the animation
- **Icons:** Lucide icons mapped per action (database, shopping-cart, package, cloud-sun, calculator, brain, hard-drive)

### 6.7 Workflow Activity Timeline

- **Data:** `workflow_runs.json` (last 20 runs)
- **Each entry shows:** Run ID, status badge, branches evaluated, flagged count, timestamp
- **Portal link:** Click to view the full run in Azure Portal

### 6.8 Microsoft Agent Chat

- **Access:** Floating action button (bottom-right corner, Azure blue `#0078D4`) and "Ask Microsoft Agent" hero button
- **Theme:** Azure/Microsoft blue (`#0078D4`) for FAB, panel header, and send button — distinct from the Wesfarmers green brand palette
- **Technology:** Azure OpenAI via Function App proxy
- **Context injection:** System prompt built from current dashboard data (replenishment, forecast, inventory, last run metadata)
- **Capabilities:** Answer questions about branch risk, stock levels, weather impact, reorder reasoning, and run history
- **Fallback:** Local keyword-matching engine when OpenAI is unavailable (matches patterns like "high risk", city names, "weather", "stock", "demand")
- **Safety:** 30-message cap per conversation; API key never exposed to browser

---

## 7. Input Data Specifications

### sales_recent.json

| Field | Type | Description |
|---|---|---|
| `branch_id` | string | Branch identifier |
| `sku_id` | string | Product SKU (always "EF001") |
| `date` | string (YYYY-MM-DD) | Sale date |
| `units_sold` | integer | Units sold that day |
| `day_of_week` | string | e.g. "Mon", "Tue", "Sat" |

**Coverage:** 30 days × 6 branches = ~180 records

**Patterns:**
- Higher sales on weekends (Sat/Sun)
- Tourist branches (Gold Coast, Sydney) have higher peaks
- Moderate demand in cooler cities (Melbourne, Adelaide)

### inventory_latest.json

| Field | Type | Description |
|---|---|---|
| `branch_id` | string | Branch identifier |
| `sku_id` | string | Product SKU |
| `stock_on_hand` | integer | Physical units in store |
| `in_transit` | integer | Units ordered and en route |
| `safety_stock` | integer | Minimum buffer policy |
| `avg_daily_sales` | number | Pre-computed 7-day rolling average |
| `last_updated` | string (ISO 8601) | Snapshot timestamp |

---

## 8. API Endpoints

### GET /api/config

Returns runtime configuration to the dashboard.

**Response:**
```json
{
  "AZURE_MAPS_KEY": "...",
  "INPUT_BASE": "https://stwesonlinephnak.blob.core.windows.net/input",
  "OUTPUT_BASE": "https://stwesonlinephnak.blob.core.windows.net/output"
}
```

**Cache:** 5 minutes (`Cache-Control: public, max-age=300`)

### POST /api/chat

Proxies chat messages to Azure OpenAI.

**Request:**
```json
{
  "messages": [
    { "role": "system", "content": "You are an operations assistant..." },
    { "role": "user", "content": "Which branches are high risk today?" }
  ]
}
```

**Response:**
```json
{
  "reply": "Three branches are flagged as high risk: Sydney WesOnline, Brisbane WesOnline, and Gold Coast WesOnline..."
}
```

**Error codes:** 400 (bad request), 502 (upstream AI error), 503 (not configured)

---

## 9. Demand Forecast Logic

The baseline demand forecast is fully deterministic and computed by the Logic App workflow (not the AI model). This ensures repeatable, auditable predictions.

### Formula

```
predicted_units = avg_daily_sales × uplift_factor
```

### Uplift Rules

| Condition | Uplift Factor | Rationale |
|---|---|---|
| Max temp > 30°C | 1.22 (+22%) | Extreme heat drives peak fan demand |
| Max temp ≥ 27°C | 1.12 (+12%) | Warm weather increases fan interest |
| Max temp < 27°C | 1.00 (no change) | Normal demand expected |

### Example Calculation

Branch: Sydney WesOnline
- 7-day average daily sales: 32.1 units
- Tomorrow max temp: 30.5°C (> 30°C threshold)
- Uplift factor: 1.22
- **Predicted demand: 32.1 × 1.22 = 39.162 units**

---

## 10. Risk Classification Logic

The agent classifies each branch into a risk level based on the stock position relative to predicted demand.

### Calculations

```
available_stock = stock_on_hand + in_transit
stock_gap       = baseline_forecast_units - available_stock
safety_buffer   = available_stock - safety_stock
```

### Classification Rules

| Risk Level | Condition | Reorder Action |
|---|---|---|
| **High** | `stock_gap > 0` AND `safety_buffer < 20` | Reorder needed: round gap up to next multiple of 10, minimum 20 |
| **Medium** | `stock_gap > 0` but `safety_buffer ≥ 20`, OR `stock_gap ≤ 0` but `safety_buffer < 10` | Reorder needed: round gap up to next multiple of 10, minimum 10 |
| **Low** | Available stock comfortably covers demand with adequate safety buffer | No reorder needed |

### Example

Branch: Sydney WesOnline
- Stock on hand: 12, In transit: 0, Safety stock: 10
- Available stock: 12 + 0 = 12
- Predicted demand: 39.162
- Stock gap: 39.162 - 12 = 27.162 (positive → demand exceeds supply)
- Safety buffer: 12 - 10 = 2 (thin margin)
- **Risk: HIGH** → reorder 30 units (gap of 27.2 rounded up to 30)
