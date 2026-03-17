/* ==============================================
   WesOnline-Demo — Enterprise Dashboard
   ============================================== */

(function () {
  'use strict';

  // ---- Configuration --------------------------------------------------------
  const CFG = window.__APP_CONFIG || {};
  const CHAT_API_URL   = CFG.CHAT_API_URL   || '/api/chat';
  const CONFIG_API_URL = CFG.CONFIG_API_URL  || '/api/config';

  // Populated at init from /api/config — no secrets in source
  let INPUT_BASE     = 'input';
  let OUTPUT_BASE    = 'output';
  let AZURE_MAPS_KEY = '';

  // Chart.js palette — Wesfarmers-inspired corporate greens
  const COLORS = {
    blue:     '#00573F',  blueBg:   'rgba(0,87,63,0.12)',
    navy:     '#003D2B',  navyBg:   'rgba(0,61,43,0.10)',
    green:    '#2E7D32',  greenBg:  'rgba(46,125,50,0.10)',
    red:      '#D32F2F',  redBg:    'rgba(211,47,47,0.10)',
    amber:    '#F57C00',  amberBg:  'rgba(245,124,0,0.10)',
    grey:     '#5c6a60',  greyBg:   'rgba(92,106,96,0.08)',
    teal:     '#00897B',  tealBg:   'rgba(0,137,123,0.10)',
    purple:   '#5E35B1',  purpleBg: 'rgba(94,53,177,0.10)'
  };

  const BRANCH_COLORS = [COLORS.blue, COLORS.green, COLORS.teal, COLORS.amber, COLORS.red, COLORS.purple];
  const BRANCH_BG     = [COLORS.blueBg, COLORS.greenBg, COLORS.tealBg, COLORS.amberBg, COLORS.redBg, COLORS.purpleBg];

  // ---- Data fetching --------------------------------------------------------
  async function fetchJSON(base, file) {
    const resp = await fetch(`${base}/${file}`);
    if (!resp.ok) throw new Error(`Failed to load ${base}/${file}: ${resp.status}`);
    return resp.json();
  }

  /** Load all data files in parallel; missing files resolve to null. */
  async function loadAllData() {
    const inputFiles = [
      { key: 'branches',         file: 'branches.json' },
      { key: 'salesrecent',      file: 'sales_recent.json' },
      { key: 'inventorylatest',  file: 'inventory_latest.json' }
    ];
    const outputFiles = [
      { key: 'forecastoutput',       file: 'forecast_output.json' },
      { key: 'replenishmentoutput',  file: 'replenishment_output.json' },
      { key: 'operatorsummary',      file: 'operator_summary.json' },
      { key: 'workflowruns',        file: 'workflow_runs.json' },
      { key: 'workflowsteps',       file: 'workflow_steps.json' }
    ];

    const allFetches = [
      ...inputFiles.map(f => fetchJSON(INPUT_BASE, f.file)),
      ...outputFiles.map(f => fetchJSON(OUTPUT_BASE, f.file))
    ];
    const allKeys = [...inputFiles, ...outputFiles];

    const results = await Promise.allSettled(allFetches);
    const data = {};
    allKeys.forEach((f, i) => {
      data[f.key] = results[i].status === 'fulfilled' ? results[i].value : null;
    });
    return data;
  }

  // ---- KPI rendering --------------------------------------------------------
  function renderKPIs(data) {
    const branches   = data.branches || [];
    const repl       = data.replenishmentoutput || [];
    const forecast   = data.forecastoutput || [];
    const sales      = data.salesrecent || [];

    const branchCount = branches.length || forecast.length || repl.length || 0;
    const highRisk    = repl.filter(r => (r.risk_level || '').toLowerCase() === 'high').length;
    const totalQty    = repl.reduce((s, r) => s + (r.recommended_order_qty || 0), 0);
    const temps       = forecast.map(f => f.tomorrow_max_temp_c).filter(Boolean);
    const avgTemp     = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : '\u2014';

    // Total predicted demand tomorrow
    const totalPredicted = forecast.reduce((s, f) => s + (f.baseline_forecast_units || 0), 0);

    setText('kpiBranches', branchCount);
    setText('kpiFlagged', highRisk);
    setText('kpiReorderQty', totalQty.toLocaleString());
    setText('kpiTotalPredicted', Math.round(totalPredicted).toLocaleString());
    setText('kpiAvgTemp', avgTemp);
    setText('mapBranchCount', branchCount ? branchCount + ' stores' : '');
  }

  // ---- Map rendering --------------------------------------------------------
  let mapInstance = null;

  function renderMap(data) {
    const branches = data.branches || [];
    const repl     = data.replenishmentoutput || [];
    const forecast = data.forecastoutput || [];

    // Build lookups
    const riskMap = {};
    repl.forEach(r => { riskMap[r.branch_id] = r; });
    const forecastMap = {};
    forecast.forEach(f => { forecastMap[f.branch_id] = f; });

    if (!branches.length) return;

    if (!AZURE_MAPS_KEY) {
      renderFallbackMap(branches, riskMap);
      return;
    }

    if (!mapInstance) {
      mapInstance = new atlas.Map('azureMap', {
        center: [134.0, -28.0],
        zoom: 3.4,
        language: 'en-AU',
        authOptions: {
          authType: 'subscriptionKey',
          subscriptionKey: AZURE_MAPS_KEY
        }
      });

      mapInstance.events.add('ready', () => addMapPins(mapInstance, branches, riskMap, forecastMap));
    } else {
      addMapPins(mapInstance, branches, riskMap, forecastMap);
    }
  }

  function addMapPins(map, branches, riskMap, forecastMap) {
    const ds = new atlas.source.DataSource();
    map.sources.add(ds);

    branches.forEach(b => {
      if (!b.latitude || !b.longitude) return;
      const risk = riskMap[b.branch_id];
      const fc   = forecastMap[b.branch_id];
      const riskLevel = risk ? risk.risk_level : 'Low';
      ds.add(new atlas.data.Feature(
        new atlas.data.Point([b.longitude, b.latitude]),
        {
          name: b.branch_name || b.city,
          risk: riskLevel,
          stockOnHand: fc ? fc.stock_on_hand : '\u2014',
          inTransit: fc ? fc.in_transit : '\u2014',
          predicted: fc ? Math.round(fc.baseline_forecast_units) : '\u2014',
          temp: fc ? fc.tomorrow_max_temp_c + '\u00b0C' : '\u2014',
          weather: fc ? fc.weather_condition : '',
          reorderQty: risk ? risk.recommended_order_qty : 0
        }
      ));
    });

    const bubbleLayer = new atlas.layer.BubbleLayer(ds, null, {
      radius: 8,
      color: ['match', ['get', 'risk'], 'High', '#dc2626', 'Medium', '#d97706', '#059669'],
      strokeColor: '#fff',
      strokeWidth: 2
    });
    map.layers.add(bubbleLayer);

    map.layers.add(new atlas.layer.SymbolLayer(ds, null, {
      textOptions: {
        textField: ['get', 'name'],
        offset: [0, 1.2],
        size: 11,
        color: '#111827',
        font: ['StandardFont-Bold']
      }
    }));

    // Hover popup
    var popup = new atlas.Popup({ closeButton: false, pixelOffset: [0, -12] });

    map.events.add('mousemove', bubbleLayer, function (e) {
      if (!e.shapes || !e.shapes.length) return;
      var props = e.shapes[0].getProperties();
      var riskColor = props.risk === 'High' ? '#dc2626' : props.risk === 'Medium' ? '#d97706' : '#059669';
      popup.setOptions({
        position: e.shapes[0].getCoordinates(),
        content: '<div style="padding:12px 14px;font-family:Inter,sans-serif;font-size:12px;min-width:180px;line-height:1.6">'
          + '<div style="font-weight:700;font-size:13px;margin-bottom:6px">' + props.name + '</div>'
          + '<div style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600;color:white;background:' + riskColor + ';margin-bottom:8px">' + props.risk + ' Risk</div>'
          + '<div style="border-top:1px solid #e5e7eb;padding-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px 12px">'
          + '<div><span style="color:#6b7280">Stock</span><br><strong>' + props.stockOnHand + '</strong></div>'
          + '<div><span style="color:#6b7280">In Transit</span><br><strong>' + props.inTransit + '</strong></div>'
          + '<div><span style="color:#6b7280">Predicted</span><br><strong>' + props.predicted + '</strong></div>'
          + '<div><span style="color:#6b7280">Reorder</span><br><strong>' + props.reorderQty + '</strong></div>'
          + '</div>'
          + '<div style="margin-top:6px;color:#6b7280">' + props.temp + ' \u2014 ' + props.weather + '</div>'
          + '</div>'
      });
      popup.open(map);
    });

    map.events.add('mouseleave', bubbleLayer, function () {
      popup.close();
    });
  }

  /** Fallback: render a simple HTML list when no Azure Maps key is set. */
  function renderFallbackMap(branches, riskMap) {
    const container = document.getElementById('azureMap');
    container.style.background = '#e8f4fd';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.padding = '18px';
    container.style.gap = '10px';
    container.style.overflowY = 'auto';

    const note = document.createElement('div');
    note.style.cssText = 'font-size:0.78rem;color:#616161;margin-bottom:6px;text-align:center;';
    note.textContent = 'Set AZURE_MAPS_KEY in config.js (via window.__ENV__) to enable the interactive map.';
    container.appendChild(note);

    branches.forEach(b => {
      const risk = riskMap[b.branch_id];
      const level = risk ? risk.risk_level : 'Low';
      const dotColor = level === 'High' ? '#dc2626' : level === 'Medium' ? '#d97706' : '#059669';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:0.875rem;padding:6px 0;';
      row.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span><strong>${sanitize(b.branch_name || b.city)}</strong><span style="color:#6b7280;font-size:0.75rem">${sanitize(b.city)} &middot; ${sanitize(level)}</span>`;
      container.appendChild(row);
    });
  }

  // ---- Recommendations panel ------------------------------------------------
  function renderRecommendations(data) {
    const repl = data.replenishmentoutput || [];
    const forecast = data.forecastoutput || [];
    const sales = data.salesrecent || [];
    const container = document.getElementById('recList');

    if (!repl.length) {
      container.innerHTML = '<div class="premium-empty-state"><p class="premium-empty-state__text">No recommendations available.</p></div>';
      return;
    }

    // Build forecast lookup
    const fcMap = {};
    forecast.forEach(f => { fcMap[f.branch_id] = f; });

    // Get latest day's sales per branch
    const latestSales = {};
    const allDates = [...new Set(sales.map(s => s.date))].sort();
    const lastDate = allDates.length ? allDates[allDates.length - 1] : null;
    if (lastDate) {
      sales.filter(s => s.date === lastDate).forEach(s => { latestSales[s.branch_id] = s.units_sold; });
    }

    const order = { high: 0, medium: 1, low: 2 };
    const sorted = [...repl].sort((a, b) =>
      (order[(a.risk_level || '').toLowerCase()] ?? 3) - (order[(b.risk_level || '').toLowerCase()] ?? 3)
    );

    const badgeMap = { high: 'danger', medium: 'warning', low: 'success' };

    container.innerHTML = '<div class="premium-list">' + sorted.map(r => {
      const level = (r.risk_level || 'low').toLowerCase();
      const variant = badgeMap[level] || 'neutral';
      const fc = fcMap[r.branch_id] || {};
      const stockOnHand = fc.stock_on_hand ?? '\u2014';
      const predicted = fc.baseline_forecast_units ? Math.round(fc.baseline_forecast_units) : '\u2014';
      const lastSold = latestSales[r.branch_id] ?? '\u2014';
      const temp = fc.tomorrow_max_temp_c ? fc.tomorrow_max_temp_c + '\u00b0C' : '';

      return `
        <div class="rec-item">
          <div class="rec-item__content">
            <div class="rec-header">
              <div>
                <div class="rec-branch">${sanitize(r.branch_name)}</div>
                <div class="rec-city">${sanitize(r.city)}${temp ? ' \u00b7 ' + sanitize(temp) : ''}</div>
              </div>
              <span class="premium-badge premium-badge--${variant}">${sanitize(r.risk_level)}</span>
            </div>
            <div class="rec-metrics rec-metrics--4">
              <div class="rec-metric">
                <div class="rec-metric-value">${stockOnHand}</div>
                <div class="rec-metric-label">On Hand</div>
              </div>
              <div class="rec-metric">
                <div class="rec-metric-value">${lastSold}</div>
                <div class="rec-metric-label">Last Day Sold</div>
              </div>
              <div class="rec-metric">
                <div class="rec-metric-value">${predicted}</div>
                <div class="rec-metric-label">Predicted</div>
              </div>
              <div class="rec-metric rec-metric--highlight">
                <div class="rec-metric-value">${r.recommended_order_qty ?? 0}</div>
                <div class="rec-metric-label">Reorder Qty</div>
              </div>
            </div>
            ${r.explanation ? `<div class="rec-explanation">${sanitize(r.explanation)}</div>` : ''}
          </div>
        </div>`;
    }).join('') + '</div>';
  }

  // ---- Sales chart (daily time-series from sales_recent.json) ---------------
  let salesChartInstance = null;

  function renderSalesChart(data) {
    const sales    = data.salesrecent || [];
    const branches = data.branches || [];
    if (!sales.length) return;

    // Get unique sorted dates
    const dateSet = [...new Set(sales.map(s => s.date))].sort();
    // Show last 14 days to keep the chart readable
    const dates = dateSet.slice(-14);

    // Build branch lookup for names
    const branchNames = {};
    branches.forEach(b => { branchNames[b.branch_id] = b.branch_name || b.city; });

    // Get unique branch IDs (in order of branches.json)
    const branchIds = branches.length
      ? branches.map(b => b.branch_id)
      : [...new Set(sales.map(s => s.branch_id))];

    // Build a dataset per branch
    const datasets = branchIds.map((bid, idx) => {
      const branchSales = {};
      sales.filter(s => s.branch_id === bid).forEach(s => { branchSales[s.date] = s.units_sold; });
      return {
        label: branchNames[bid] || bid,
        data: dates.map(d => branchSales[d] || 0),
        borderColor: BRANCH_COLORS[idx % BRANCH_COLORS.length],
        backgroundColor: BRANCH_BG[idx % BRANCH_BG.length],
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.3,
        fill: false
      };
    });

    const labels = dates.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    });

    const ctx = document.getElementById('salesChart').getContext('2d');
    if (salesChartInstance) salesChartInstance.destroy();

    salesChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: chartOptions('Units Sold')
    });
  }

  // ---- Stock / Inventory chart (from inventory_latest.json) -----------------
  let stockChartInstance = null;

  function renderStockChart(data) {
    const inventory = data.inventorylatest || [];
    const branches  = data.branches || [];
    const forecast  = data.forecastoutput || [];
    if (!inventory.length && !forecast.length) return;

    // Merge inventory with branch names
    const branchNames = {};
    branches.forEach(b => { branchNames[b.branch_id] = b.branch_name || b.city; });

    // Build forecast lookup for predicted demand
    const forecastMap = {};
    forecast.forEach(f => { forecastMap[f.branch_id] = f; });

    // Use inventory order; fall back to forecast if no inventory
    const items = inventory.length ? inventory : forecast;

    const labels    = items.map(i => branchNames[i.branch_id] || i.branch_id);
    const onHand    = items.map(i => i.stock_on_hand || 0);
    const inTransit = items.map(i => i.in_transit || 0);
    const safety    = items.map(i => i.safety_stock || 0);
    const predicted = items.map(i => {
      const f = forecastMap[i.branch_id];
      return f ? (f.baseline_forecast_units || 0) : 0;
    });

    const ctx = document.getElementById('stockChart').getContext('2d');
    if (stockChartInstance) stockChartInstance.destroy();

    stockChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Stock On Hand',
            data: onHand,
            backgroundColor: COLORS.greenBg,
            borderColor: COLORS.green,
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: 'In Transit',
            data: inTransit,
            backgroundColor: COLORS.purpleBg,
            borderColor: COLORS.purple,
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: 'Safety Stock',
            data: safety,
            backgroundColor: COLORS.greyBg,
            borderColor: COLORS.grey,
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: 'Predicted Demand',
            data: predicted,
            type: 'line',
            borderColor: COLORS.red,
            backgroundColor: COLORS.redBg,
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: COLORS.red,
            tension: 0.3,
            fill: false
          }
        ]
      },
      options: chartOptions('Units')
    });
  }

  function chartOptions(yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: "'Inter', 'Segoe UI', sans-serif", size: 11, weight: '500' },
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
            usePointStyle: true,
            pointStyle: 'rectRounded'
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 11, family: "'Inter', sans-serif" }, maxRotation: 45, minRotation: 0, color: '#6b7280' },
          grid: { display: false },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: yLabel, font: { size: 11, family: "'Inter', sans-serif", weight: '500' }, color: '#6b7280' },
          ticks: { font: { size: 11 }, color: '#6b7280' },
          grid: { color: 'rgba(0,0,0,0.04)' },
          border: { display: false }
        }
      }
    };
  }

  // ---- Workflow activity log --------------------------------------------------
  function renderTimeline(data) {
    const runs  = data.workflowruns || [];
    const el    = document.getElementById('timelineList');

    if (!runs.length) {
      el.innerHTML = '<div class="premium-empty-state"><p class="premium-empty-state__text">No workflow runs recorded yet.</p></div>';
      return;
    }

    const sorted = [...runs].sort((a, b) => new Date(b.started_at || b.timestamp || 0) - new Date(a.started_at || a.timestamp || 0));

    el.innerHTML = '<div class="premium-list premium-list--timeline">' + sorted.map(run => {
      const ok = (run.status || '').toLowerCase() === 'succeeded';
      const dotClass = ok ? 'dot-success' : 'dot-error';
      const badgeVariant = ok ? 'success' : 'danger';
      const ts = run.started_at || run.timestamp || '';
      const hasLink = !!run.portal_url;
      const branchInfo = run.branches_evaluated ? `${run.branches_evaluated} branches evaluated` : '';

      const titleHtml = hasLink
        ? `<a href="${sanitize(run.portal_url)}" target="_blank" rel="noopener">${sanitize(run.run_id || 'Run')}</a><span class="icon-external"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>`
        : sanitize(run.run_id || 'Run');

      return `
        <div class="premium-list-item${hasLink ? ' clickable' : ''}"${hasLink ? ` onclick="window.open('${sanitize(run.portal_url)}','_blank')"` : ''}>
          <div class="activity-status-dot ${dotClass}"></div>
          <div class="activity-info">
            <div class="activity-title">${titleHtml}</div>
            <div class="activity-subtitle">${sanitize(branchInfo)}</div>
          </div>
          <span class="premium-badge premium-badge--${badgeVariant}">${sanitize(run.status || 'Unknown')}</span>
          <span class="activity-timestamp">${sanitize(formatTimestamp(ts))}</span>
        </div>`;
    }).join('') + '</div>';

    if (sorted.length) {
      const last = sorted[0];
      setText('lastRunLabel', formatTimestamp(last.started_at || last.timestamp || ''));
    }
  }

  // ---- Utilities ------------------------------------------------------------
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function sanitize(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatTimestamp(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Sydney' });
    } catch {
      return ts;
    }
  }

  // ---- Chat panel ----------------------------------------------------------
  let chatOpen = false;
  let dashboardData = null;
  let chatHistory = [];

  function isChatConfigured() {
    return !!CHAT_API_URL;
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById('chatPanel').classList.toggle('open', chatOpen);
    document.getElementById('chatFab').classList.toggle('hidden', chatOpen);
    if (chatOpen) document.getElementById('chatInput').focus();
  }

  function initChat() {
    const form = document.getElementById('chatForm');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      appendChatMsg(text, 'user');
      handleChatQuery(text);
    });

    // Show mode indicator in the welcome message
    const modeLabel = isChatConfigured() ? 'AI-powered' : 'local';
    const welcomeBubble = document.querySelector('.chat-msg-agent .chat-bubble');
    if (welcomeBubble) {
      welcomeBubble.textContent = `Hello. I'm the WesOnline operations assistant (${modeLabel}). I can help with branch risk, stock levels, weather impact, and the latest nightly run.`;
    }
  }

  function appendChatMsg(text, role, extraClass) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble' + (extraClass ? ' ' + extraClass : '');
    bubble.textContent = text;
    div.appendChild(bubble);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  /** Route to Azure OpenAI or local fallback. */
  async function handleChatQuery(query) {
    const typing = appendChatMsg('Thinking\u2026', 'agent', 'typing');

    if (isChatConfigured()) {
      try {
        const answer = await callChatProxy(query, dashboardData);
        typing.textContent = answer;
      } catch (err) {
        console.error('Chat proxy error:', err);
        typing.textContent = 'Sorry, the AI service is unavailable. Falling back to local mode.';
        const fallback = generateLocalAnswer(query, dashboardData);
        appendChatMsg(fallback, 'agent');
      }
    } else {
      const answer = generateLocalAnswer(query, dashboardData);
      typing.textContent = answer;
    }

    typing.classList.remove('typing');
    document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
  }

  // ---- Azure OpenAI conversational agent ------------------------------------

  /** Build the system prompt with current data context. */
  function buildSystemPrompt(data) {
    const repl      = data.replenishmentoutput || [];
    const forecast  = data.forecastoutput || [];
    const inventory = data.inventorylatest || [];
    const summary   = data.operatorsummary || {};
    const runs      = data.workflowruns || [];
    const branches  = data.branches || [];

    const branchNames = {};
    branches.forEach(b => { branchNames[b.branch_id] = b.branch_name; });

    // Compact data summaries to fit in context
    const replSummary = repl.map(r =>
      `${r.branch_name} (${r.city}): risk=${r.risk_level}, reorder=${r.reorder_needed}, qty=${r.recommended_order_qty}, confidence=${r.confidence}. ${r.explanation}`
    ).join('\n');

    const forecastSummary = forecast.map(f =>
      `${f.branch_name || branchNames[f.branch_id] || f.branch_id} (${f.city}): temp=${f.tomorrow_max_temp_c}\u00b0C, weather="${f.weather_condition}", avg7=${f.recent_7_day_avg_sales}, predicted=${f.baseline_forecast_units}, stock=${f.stock_on_hand}, in_transit=${f.in_transit}, safety=${f.safety_stock}`
    ).join('\n');

    const invSummary = inventory.map(i =>
      `${branchNames[i.branch_id] || i.branch_id}: on_hand=${i.stock_on_hand}, in_transit=${i.in_transit}, safety=${i.safety_stock}`
    ).join('\n');

    const lastRun = runs.length
      ? (() => {
          const r = [...runs].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0];
          return `run_id=${r.run_id}, status=${r.status}, started=${r.started_at}, duration=${r.duration_seconds}s, branches=${r.branches_evaluated}, flagged=${r.flagged_branches}, total_qty=${r.total_recommended_qty}`;
        })()
      : 'No runs recorded.';

    return `You are the operations assistant for WesOnline-Demo, an Australian electronics retailer selling electric fans across 6 stores.
Your role is to help store operators understand tonight's replenishment plan and answer questions about stock, demand, weather impact, and agent decisions.
Fan demand is strongly temperature-driven — hotter days mean more fans sold.

RULES:
- Answer concisely in 1-4 sentences unless the user asks for detail.
- Use the DATA below. NEVER invent branch names, stock numbers, or recommendations.
- When explaining risk, reference temperature, stock levels, and predicted demand.
- Use Australian English and Celsius.
- If you don't have data to answer, say so honestly.

## REPLENISHMENT RECOMMENDATIONS (from last 03:00 AM agent run)
${replSummary || 'No recommendations available.'}

## FORECAST & BRANCH DATA
${forecastSummary || 'No forecast data available.'}

## CURRENT INVENTORY
${invSummary || 'No inventory data available.'}

## LAST WORKFLOW RUN
${lastRun}

## OPERATOR SUMMARY
${summary.summary || 'No summary available.'}`;
  }

  /** Call the Azure Function chat proxy. */
  async function callChatProxy(userMessage, data) {
    const systemPrompt = buildSystemPrompt(data || {});

    chatHistory.push({ role: 'user', content: userMessage });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory
    ];

    const resp = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.error || `Chat API ${resp.status}`);
    }

    const result = await resp.json();
    const assistantMsg = result.reply;

    chatHistory.push({ role: 'assistant', content: assistantMsg });
    return assistantMsg;
  }

  // ---- Local fallback agent -------------------------------------------------

  function generateLocalAnswer(query, data) {
    if (!data) return 'Data is still loading. Please try again in a moment.';

    const q = query.toLowerCase();
    const forecast = data.forecastoutput || [];
    const repl = data.replenishmentoutput || [];
    const summary = data.operatorsummary || {};
    const runs = data.workflowruns || [];
    const inventory = data.inventorylatest || [];
    const branches = data.branches || [];

    // Match a specific branch
    const matchedBranch = repl.find(r =>
      q.includes(r.city.toLowerCase()) ||
      q.includes(r.branch_name.toLowerCase())
    );

    // High risk question
    if (q.includes('high risk') || q.includes('flagged') || q.includes('urgent') || q.includes('which store') || q.includes('which branch') || q.includes('need stock')) {
      const flagged = repl.filter(r => r.risk_level === 'High');
      if (!flagged.length) return 'No branches are currently flagged as high risk.';
      const list = flagged.map(r => `${r.branch_name} (${r.city}) \u2014 order ${r.recommended_order_qty} units`).join('; ');
      return `High-risk branches: ${list}.`;
    }

    // Specific branch
    if (matchedBranch) {
      const b = matchedBranch;
      const f = forecast.find(x => x.branch_id === b.branch_id);
      let answer = `${b.branch_name} (${b.city}): Risk ${b.risk_level}, reorder ${b.reorder_needed ? 'Yes' : 'No'}.`;
      if (b.recommended_order_qty) answer += ` Recommended qty: ${b.recommended_order_qty} units.`;
      if (f) answer += ` Temp: ${f.tomorrow_max_temp_c}\u00b0C (${f.weather_condition}). Predicted demand: ${f.baseline_forecast_units} units. Stock on hand: ${f.stock_on_hand}, in transit: ${f.in_transit}.`;
      if (b.explanation) answer += ` \u2014 ${b.explanation}`;
      return answer;
    }

    // Weather
    if (q.includes('weather') || q.includes('temperature') || q.includes('temp') || q.includes('hot')) {
      if (!forecast.length) return 'No forecast data available.';
      const lines = forecast.map(f => `${f.city}: ${f.tomorrow_max_temp_c}\u00b0C (${f.weather_condition})`);
      return 'Tomorrow\'s forecast: ' + lines.join('; ') + '.';
    }

    // Last run
    if (q.includes('last run') || q.includes('latest run') || q.includes('nightly') || q.includes('03:00') || q.includes('workflow')) {
      if (!runs.length) return 'No workflow runs recorded yet.';
      const last = [...runs].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0];
      return `Last run: ${last.run_id}, status ${last.status}, started ${formatTimestamp(last.started_at)}, duration ${last.duration_seconds || '?'}s. Evaluated ${last.branches_evaluated} branches, ${last.flagged_branches} flagged, ${last.total_recommended_qty} units recommended.`;
    }

    // Summary
    if (q.includes('summary') || q.includes('overview') || q.includes('status')) {
      if (summary.summary) return summary.summary;
      const total = repl.reduce((s, r) => s + (r.recommended_order_qty || 0), 0);
      return `${repl.length} branches evaluated. Total reorder: ${total} units. High-risk count: ${repl.filter(r => r.risk_level === 'High').length}.`;
    }

    // Stock
    if (q.includes('stock') || q.includes('inventory')) {
      const inv = inventory.length ? inventory : forecast;
      if (!inv.length) return 'No inventory data available.';
      const branchNames = {};
      branches.forEach(b => { branchNames[b.branch_id] = b.city; });
      const lines = inv.map(i => `${branchNames[i.branch_id] || i.branch_id}: ${i.stock_on_hand} on hand, ${i.in_transit} in transit (safety: ${i.safety_stock})`);
      return lines.join('; ') + '.';
    }

    // Demand
    if (q.includes('demand') || q.includes('forecast') || q.includes('predicted') || q.includes('sales')) {
      if (!forecast.length) return 'No forecast data available.';
      const lines = forecast.map(f => `${f.city}: avg7 ${f.recent_7_day_avg_sales}, predicted ${f.baseline_forecast_units}`);
      return lines.join('; ') + '.';
    }

    // Reorder
    if (q.includes('reorder') || q.includes('order') || q.includes('recommend')) {
      const orders = repl.filter(r => r.reorder_needed);
      if (!orders.length) return 'No reorders are currently recommended.';
      const list = orders.map(r => `${r.branch_name}: ${r.recommended_order_qty} units`);
      return 'Recommended orders: ' + list.join('; ') + '.';
    }

    // Fallback
    return 'I can answer questions about branch risk, stock levels, weather forecasts, demand predictions, reorder recommendations, and the latest nightly workflow run. Try asking about a specific city or topic!';
  }

  // ---- Bootstrap (updated) --------------------------------------------------
  async function init() {
    try {
      // Fetch runtime config from server (keys live server-side)
      try {
        const cfgResp = await fetch(CONFIG_API_URL);
        if (cfgResp.ok) {
          const serverCfg = await cfgResp.json();
          if (serverCfg.INPUT_BASE)     INPUT_BASE     = serverCfg.INPUT_BASE;
          if (serverCfg.OUTPUT_BASE)    OUTPUT_BASE    = serverCfg.OUTPUT_BASE;
          if (serverCfg.AZURE_MAPS_KEY) AZURE_MAPS_KEY = serverCfg.AZURE_MAPS_KEY;
        }
      } catch (e) {
        console.warn('Could not load /api/config, using defaults:', e.message);
      }

      const data = await loadAllData();
      dashboardData = data;

      renderKPIs(data);
      renderMap(data);
      renderRecommendations(data);
      renderSalesChart(data);
      renderStockChart(data);
      renderTimeline(data);
    } catch (err) {
      console.error('Dashboard init error:', err);
    }
  }

  // Expose API
  window.app = { refresh: init, toggleChat: toggleChat };

  // Go
  initChat();
  init();
})();
