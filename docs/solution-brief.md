# Southern Scoops Agentic Replenishment Demo

## Overview

This solution demonstrates how **Microsoft Azure Agentic AI workflows** can support retail operations using autonomous decision-making.

The demo simulates an Australian ice cream retailer named **Southern Scoops Ice Cream Co.**

Every night at **03:00 AM Australia/Sydney time**, an autonomous agent evaluates store conditions and determines whether each branch needs to reorder stock for the next day.

The system combines:

- historical sales
- current stock levels
- in-transit inventory
- safety stock policies
- real weather forecasts

The goal is to demonstrate **AI-driven operational decision support** using Azure.

---

# Business Scenario

Southern Scoops operates multiple ice cream stores across major Australian cities.

Ice cream demand is highly influenced by **weather conditions**, especially temperature.

Store managers traditionally review:

- recent sales
- available stock
- incoming deliveries
- weather forecast

to decide whether additional stock should be ordered for the next day.

This manual process is time consuming and inconsistent.

The demo shows how an **autonomous AI agent** can perform this analysis every night and generate **recommended replenishment orders**.

---

# Key Demo Capabilities

The solution demonstrates four major capabilities:

### 1. Autonomous Planning Agent
A Logic App workflow runs nightly and evaluates stock risk for each store.

The agent:

- reviews sales trends
- checks current inventory
- analyzes weather forecast
- predicts demand
- recommends reorder quantities

### 2. Weather-Aware Forecasting
The system integrates with **Azure Maps Weather API** to retrieve the next day's forecast.

Demand predictions increase when temperatures rise.

Example rule:

- above 30°C → strong demand increase
- 27–30°C → moderate demand increase

### 3. Operational Dashboard
A web dashboard displays:

- store locations on a map
- historical sales trends
- stock levels
- predicted demand
- agent recommendations
- workflow run history

The dashboard is mobile-friendly and designed in a **Microsoft-style UI**.

### 4. Conversational Operations Assistant
Operators can ask questions such as:

- Which stores need stock tomorrow?
- Why is Sydney high risk?
- What happened during the last 03:00 AM run?

A conversational AI agent answers using the latest workflow output.

---

# Architecture

The solution uses Azure services to implement an agent-driven workflow.

### Core services

- Azure Logic Apps Standard
- Azure OpenAI
- Azure Maps Weather API
- Azure Blob Storage
- Azure Static Web Apps

---

# Architecture Diagram (Conceptual)
Sales Data
Inventory Data
Branch Data
│
▼
Azure Blob Storage
│
▼
Logic App Workflow
Nightly Stock Planner
│
├── Weather Forecast (Azure Maps)
├── Demand Forecast Calculation
└── Autonomous Agent Decision
│
▼
Replenishment Output JSON
│
▼
Azure Static Web App Dashboard
│
▼
Operations Chat Agent


---

# Data Model

The demo uses simplified retail data.

## Branches

Example cities:

- Sydney
- Melbourne
- Brisbane
- Perth
- Adelaide
- Gold Coast

Example fields:
branch_id
branch_name
city
state
latitude
longitude
store_type


---

## Product

The demo focuses on one SKU:
sku_id: IC001
name: Classic Vanilla Ice Cream Tub 500ml
price: AUD 7.50


---

## Sales

Recent sales data is used to calculate a **7-day average demand**.

Example fields:
branch_id
date
units_sold



---

## Inventory

Inventory data tracks available stock.

Example fields:
branch_id
sku_id
stock_on_hand
in_transit
safety_stock


---

# Demand Forecast Logic

The workflow calculates a baseline forecast using recent sales.

### Step 1 — Calculate average sales


avg7 = average units sold over last 7 days


### Step 2 — Weather uplift

Temperature influences demand.

Rules:


Temp > 30°C → demand +22%
Temp ≥ 27°C → demand +12%
Else → no uplift


### Step 3 — Predicted demand


predicted_units = avg7 × uplift


---

# Agent Decision Logic

The AI agent reviews each branch and determines:

- risk level
- reorder requirement
- recommended order quantity
- explanation for decision

The agent returns structured JSON such as:

```json
{
  "branch_id": "BR001",
  "risk_level": "High",
  "reorder_needed": true,
  "recommended_order_qty": 60,
  "confidence": "High",
  "explanation": "Sydney forecast temperature of 31°C and strong recent sales indicate demand will exceed available stock."
}
Workflow Schedule

The nightly planning workflow runs:

03:00 AM
Australia/Sydney time
Every day

The workflow performs the following steps:

Load branch data

Load recent sales

Load inventory

Loop through branches

Retrieve weather forecast

Calculate baseline forecast

Prepare branch data

Send data to agent

Receive recommendations

Write output JSON

Output Files

Workflow results are stored in Blob Storage.

Example files:

forecast_output.json
replenishment_output.json
operator_summary.json
workflow_runs.json
workflow_steps.json

These files power the dashboard and chat agent.

User Interface

The dashboard includes:

Map view

Store locations displayed using Azure Maps.

Sales charts

Historical sales trends per branch.

Inventory view

Current stock vs predicted demand.

Agent panel

Latest recommendations from the AI agent.

Workflow history

Timeline of nightly planning runs.

Demo Value

The demo illustrates how agentic AI workflows can support real business operations.

Benefits include:

automated decision support

faster operational planning

improved stock availability

reduced manual analysis

explainable AI recommendations

Target Audience

This demo is designed for:

retail executives

supply chain leaders

AI platform architects

Microsoft solution engineers


---

# Why this file is important for Copilot

This file helps Copilot understand:

- the **business context**
- the **expected architecture**
- the **data model**
- the **workflow logic**
- the **agent role**

Without this, Copilot often generates **generic cloud architecture** instead of the specific retail AI scenario you want.

---

# Recommended repo structure

Your repo should look like this:


southern-scoops-demo
│
├─ .github
│ └─ copilot-instructions.md
│
├─ docs
│ ├─ solution-brief.md
│ ├─ architecture.md
│ ├─ sample-branchInputs.json
│ └─ sample-agent-output.json
│
├─ logicapps
│ └─ nightly-stock-planner.json
│
├─ webapp
│ ├─ index.html
│ ├─ app.js
│ └─ styles.css
│
└─ README.md


---

# Pro tip (very useful)

Also add this small file:


docs/agent-role.md


That file describes **exactly how the AI agent should behave**, which helps Copilot generate much better prompts.

---

If you'd like, I can also give you a **ready-to-use `README.md` for the repo** that will make this demo 