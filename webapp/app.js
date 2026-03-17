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

  // Chart.js palette — Wesfarmers corporate green
  const COLORS = {
    brand:    '#00843D',  brandBg:  'rgba(0,132,61,0.10)',
    dark:     '#004225',  darkBg:   'rgba(0,66,37,0.08)',
    green:    '#16a34a',  greenBg:  'rgba(22,163,74,0.10)',
    red:      '#dc2626',  redBg:    'rgba(220,38,38,0.08)',
    amber:    '#d97706',  amberBg:  'rgba(217,119,6,0.08)',
    grey:     '#6b7280',  greyBg:   'rgba(107,114,128,0.08)',
    teal:     '#0d9488',  tealBg:   'rgba(13,148,136,0.08)',
    blue:     '#2563eb',  blueBg:   'rgba(37,99,235,0.08)',
    purple:   '#7c3aed',  purpleBg: 'rgba(124,58,237,0.08)'
  };

  const BRANCH_COLORS = [COLORS.brand, COLORS.teal, COLORS.blue, COLORS.green, COLORS.amber, COLORS.purple];
  const BRANCH_BG     = [COLORS.brandBg, COLORS.tealBg, COLORS.blueBg, COLORS.greenBg, COLORS.amberBg, COLORS.purpleBg];

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

    // "Stores need action" = how many have reorder_needed=true
    const actionCount = repl.filter(r => r.reorder_needed).length;

    // Confidence: use most common from repl
    const confCounts = {};
    repl.forEach(r => { const c = (r.confidence || 'Medium'); confCounts[c] = (confCounts[c] || 0) + 1; });
    const planConfidence = Object.keys(confCounts).sort((a, b) => confCounts[b] - confCounts[a])[0] || '\u2014';

    // Coverage: percent of branches that don't need reorder
    const covered = repl.filter(r => !r.reorder_needed).length;
    const coveragePct = branchCount > 0 ? Math.round((covered / branchCount) * 100) + '%' : '\u2014';

    // Micro detail strings
    const hotCount = temps.filter(t => t > 30).length;
    const demandMicro = forecast.length
      ? `Highest: ${[...forecast].sort((a, b) => (b.baseline_forecast_units || 0) - (a.baseline_forecast_units || 0))[0].city}`
      : '';
    const weatherMicro = hotCount > 0 ? `${hotCount} city${hotCount > 1 ? 's' : ''} above 30\u00b0C` : 'No extreme heat';

    // Populate all KPI slots
    animateCountUp('kpiBranchesAction', actionCount);
    animateCountUp('kpiFlagged', highRisk);
    animateCountUp('kpiReorderQty', totalQty);
    animateCountUp('kpiTotalPredicted', Math.round(totalPredicted));
    setText('kpiAvgTemp', avgTemp + '\u00b0');
    animateCountUp('kpiBranches', branchCount);
    setText('kpiConfidence', planConfidence);
    setText('kpiCoverage', coveragePct);
    setText('kpiDemandMicro', demandMicro);
    setText('kpiWeatherMicro', weatherMicro);
    setText('mapBranchCount', branchCount ? branchCount + ' stores' : '');

    // Enhanced headline: AI insight, risk bar, weather chips, news ticker
    renderHeadlineInsight(data);
  }

  // ---- Headline AI Insight --------------------------------------------------
  function renderHeadlineInsight(data) {
    const forecast = data.forecastoutput || [];
    const repl     = data.replenishmentoutput || [];

    // Bail if no data
    if (!forecast.length && !repl.length) return;

    // --- Risk distribution bar ---
    const riskCounts = { high: 0, medium: 0, low: 0 };
    repl.forEach(r => {
      const lvl = (r.risk_level || 'low').toLowerCase();
      if (lvl === 'high') riskCounts.high++;
      else if (lvl === 'medium') riskCounts.medium++;
      else riskCounts.low++;
    });
    const total = repl.length || 1;
    const riskBarEl = document.getElementById('headlineRiskBar');
    if (riskBarEl) {
      riskBarEl.innerHTML = [
        riskCounts.high   ? `<div class="headline__risk-seg headline__risk-seg--high" style="width:${(riskCounts.high / total * 100).toFixed(1)}%"></div>` : '',
        riskCounts.medium ? `<div class="headline__risk-seg headline__risk-seg--medium" style="width:${(riskCounts.medium / total * 100).toFixed(1)}%"></div>` : '',
        riskCounts.low    ? `<div class="headline__risk-seg headline__risk-seg--low" style="width:${(riskCounts.low / total * 100).toFixed(1)}%"></div>` : ''
      ].join('');
    }

    // --- AI Insight text (deterministic synthesis) ---
    const insightEl = document.getElementById('headlineInsightText');
    if (insightEl) {
      const insight = buildInsightSummary(forecast, repl);
      insightEl.textContent = insight;
    }

    // --- Weather chips ---
    const weatherStripEl = document.getElementById('headlineWeatherStrip');
    if (weatherStripEl && forecast.length) {
      const hottest = [...forecast].sort((a, b) => (b.tomorrow_max_temp_c || 0) - (a.tomorrow_max_temp_c || 0))[0];
      const heatCount = forecast.filter(f => f.tomorrow_max_temp_c > 30).length;
      const chips = [];
      if (hottest) {
        const isHot = hottest.tomorrow_max_temp_c > 30;
        chips.push(`<span class="headline__weather-chip${isHot ? ' headline__weather-chip--hot' : ''}">${hottest.city} ${hottest.tomorrow_max_temp_c}\u00b0C — ${hottest.weather_condition || ''}</span>`);
      }
      if (heatCount > 0) {
        chips.push(`<span class="headline__weather-chip headline__weather-chip--hot">${heatCount} cit${heatCount > 1 ? 'ies' : 'y'} above 30\u00b0C</span>`);
      }
      const avgT = forecast.reduce((s, f) => s + (f.tomorrow_max_temp_c || 0), 0) / forecast.length;
      chips.push(`<span class="headline__weather-chip">Avg ${avgT.toFixed(1)}\u00b0C across ${forecast.length} stores</span>`);
      weatherStripEl.innerHTML = chips.join('');
    }

    // --- News ticker ---
    const newsScrollEl = document.getElementById('headlineNewsScroll');
    if (newsScrollEl && forecast.length) {
      const allNews = [];
      forecast.forEach(f => {
        if (f.local_news) {
          const headlines = f.local_news.split('|').map(h => h.trim()).filter(Boolean);
          headlines.forEach(h => {
            if (!allNews.includes(h)) allNews.push(h);
          });
        }
      });
      if (allNews.length) {
        const sep = '<span class="headline__news-sep">\u2022</span>';
        const repeated = allNews.join(sep) + sep + allNews.join(sep);
        newsScrollEl.innerHTML = repeated;
        const duration = Math.max(20, allNews.length * 5);
        newsScrollEl.style.animationDuration = duration + 's';
      } else {
        const newsRow = document.getElementById('headlineNews');
        if (newsRow) newsRow.style.display = 'none';
      }
    }
  }

  function buildInsightSummary(forecast, repl) {
    const highRisk = repl.filter(r => (r.risk_level || '').toLowerCase() === 'high');
    const totalQty = repl.reduce((s, r) => s + (r.recommended_order_qty || 0), 0);
    const totalPredicted = forecast.reduce((s, f) => s + (f.baseline_forecast_units || 0), 0);
    const totalStock = forecast.reduce((s, f) => s + (f.stock_on_hand || 0) + (f.in_transit || 0), 0);
    const coveragePct = totalPredicted > 0 ? Math.round((totalStock / totalPredicted) * 100) : 100;

    // Find most critical branch
    let critical = null;
    let worstGap = 0;
    forecast.forEach(f => {
      const available = (f.stock_on_hand || 0) + (f.in_transit || 0);
      const gap = (f.baseline_forecast_units || 0) - available;
      if (gap > worstGap) { worstGap = gap; critical = f; }
    });

    // Build sentence
    const parts = [];
    if (highRisk.length > 0) {
      const cities = highRisk.map(r => r.city).join(', ');
      parts.push(`${highRisk.length} high-risk store${highRisk.length > 1 ? 's' : ''} identified: ${cities}.`);
    } else {
      parts.push('All stores within safe stock levels.');
    }

    if (critical) {
      const avail = (critical.stock_on_hand || 0) + (critical.in_transit || 0);
      const pct = critical.baseline_forecast_units > 0
        ? Math.round((avail / critical.baseline_forecast_units) * 100)
        : 100;
      parts.push(`${critical.city} is most critical \u2014 stock covers only ${pct}% of forecast demand.`);
    }

    if (coveragePct < 80) {
      parts.push(`Network-wide inventory covers ${coveragePct}% of projected demand.`);
    }

    if (totalQty > 0) {
      parts.push(`${totalQty} units recommended for reorder tonight.`);
    }

    // Weather driver
    const hotCities = forecast.filter(f => f.tomorrow_max_temp_c > 30);
    if (hotCities.length > 0) {
      parts.push(`Heatwave conditions driving demand uplift in ${hotCities.length === 1 ? hotCities[0].city : hotCities.length + ' cities'}.`);
    }

    return parts.join(' ');
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

    const mapContainer = document.getElementById('azureMap');
    if (!AZURE_MAPS_KEY) {
      renderFallbackMap(branches, riskMap);
      return;
    }

    // Ensure the map container has a minimum height for the SDK
    if (mapContainer) mapContainer.style.minHeight = '360px';

    if (!mapInstance) {
      try {
        mapInstance = new atlas.Map('azureMap', {
          center: [134.0, -28.0],
          zoom: 3.4,
          style: 'road',
          language: 'en-AU',
          authOptions: {
            authType: 'subscriptionKey',
            subscriptionKey: AZURE_MAPS_KEY
          }
        });

        mapInstance.events.add('ready', () => addMapPins(mapInstance, branches, riskMap, forecastMap));
        mapInstance.events.add('error', (e) => {
          console.warn('Azure Maps error, falling back:', e.error);
          mapInstance = null;
          renderFallbackMap(branches, riskMap);
        });
      } catch (e) {
        console.warn('Azure Maps init failed:', e);
        renderFallbackMap(branches, riskMap);
      }
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
        color: '#1a1c23',
        font: ['StandardFont-Bold']
      }
    }));

    // Hover popup
    var popup = new atlas.Popup({ closeButton: false, pixelOffset: [0, -12] });

    map.events.add('mousemove', bubbleLayer, function (e) {
      if (!e.shapes || !e.shapes.length) return;
      var props = e.shapes[0].getProperties();
      var riskColor = props.risk === 'High' ? '#dc2626' : props.risk === 'Medium' ? '#d97706' : '#16a34a';
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
    container.style.background = '#f5f6f8';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.padding = '18px';
    container.style.gap = '10px';
    container.style.overflowY = 'auto';

    const note = document.createElement('div');
    note.style.cssText = 'font-size:0.78rem;color:#6b7280;margin-bottom:6px;text-align:center;';
    note.textContent = 'Set AZURE_MAPS_KEY in config to enable the interactive map.';
    container.appendChild(note);

    branches.forEach(b => {
      const risk = riskMap[b.branch_id];
      const level = risk ? risk.risk_level : 'Low';
      const dotColor = level === 'High' ? '#dc2626' : level === 'Medium' ? '#d97706' : '#16a34a';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:0.875rem;padding:6px 0;color:#1a1c23;';
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
    const riskIconMap = { high: 'alert-triangle', medium: 'alert-circle', low: 'check-circle' };
    const confIconMap = { high: 'shield-check', medium: 'shield', low: 'shield-alert' };

    const cards = sorted.map((r, idx) => {
      const level = (r.risk_level || 'low').toLowerCase();
      const variant = badgeMap[level] || 'neutral';
      const fc = fcMap[r.branch_id] || {};
      const stockOnHand = fc.stock_on_hand ?? '\u2014';
      const inTransit = fc.in_transit ?? 0;
      const safetyStock = fc.safety_stock ?? '\u2014';
      const avg7 = fc.recent_7_day_avg_sales ? fc.recent_7_day_avg_sales.toFixed(1) : '\u2014';
      const predicted = fc.baseline_forecast_units ? Math.round(fc.baseline_forecast_units) : '\u2014';
      const lastSold = latestSales[r.branch_id] ?? '\u2014';
      const temp = fc.tomorrow_max_temp_c ?? '\u2014';
      const weather = fc.weather_condition || '';
      const localNews = fc.local_news || '';
      const confidence = r.confidence || 'Medium';
      const confLevel = confidence.toLowerCase();
      const reorderQty = r.recommended_order_qty ?? 0;

      // Compute stock gap and coverage ratio for visual indicators
      const available = (typeof stockOnHand === 'number' ? stockOnHand : 0) + inTransit;
      const forecastNum = fc.baseline_forecast_units ? Math.round(fc.baseline_forecast_units) : 0;
      const coverageRatio = forecastNum > 0 ? Math.min((available / forecastNum) * 100, 100) : 100;
      const stockGap = forecastNum > 0 ? forecastNum - available : 0;

      // Weather uplift indicator
      const tempNum = parseFloat(temp);
      let upliftLabel = '';
      let upliftClass = '';
      if (!isNaN(tempNum)) {
        if (tempNum > 30) { upliftLabel = '+22% heat uplift'; upliftClass = 'uplift-high'; }
        else if (tempNum >= 27) { upliftLabel = '+12% warm uplift'; upliftClass = 'uplift-med'; }
        else { upliftLabel = 'No uplift'; upliftClass = 'uplift-none'; }
      }

      // News sentiment analysis
      let newsItems = [];
      let newsSentiment = 'neutral';
      let newsIcon = 'newspaper';
      if (localNews && localNews !== 'No relevant local news') {
        newsItems = localNews.split(' | ').filter(Boolean).slice(0, 3);
        const newsLower = localNews.toLowerCase();
        if (newsLower.includes('heatwave') || newsLower.includes('extreme heat') || newsLower.includes('record') || newsLower.includes('power outage')) {
          newsSentiment = 'hot';
          newsIcon = 'flame';
        } else if (newsLower.includes('cool') || newsLower.includes('rain') || newsLower.includes('cold') || newsLower.includes('storm')) {
          newsSentiment = 'cool';
          newsIcon = 'cloud-rain';
        }
      }
      const newsSentimentLabel = { hot: 'Demand Signal', cool: 'Low Signal', neutral: 'Neutral' }[newsSentiment];
      const newsSentimentVariant = { hot: 'danger', cool: 'info', neutral: 'neutral' }[newsSentiment];

      const weatherIconName = weather.toLowerCase().includes('sun') || weather.toLowerCase().includes('clear') ? 'sun' :
        weather.toLowerCase().includes('cloud') ? 'cloud' :
        weather.toLowerCase().includes('rain') ? 'cloud-rain' :
        weather.toLowerCase().includes('storm') ? 'cloud-lightning' : 'thermometer';

      return `
        <div class="rec-card rec-card--${variant}" style="--anim-delay: ${idx * 0.08}s">
          <!-- Top stripe -->
          <div class="rec-card__stripe rec-card__stripe--${variant}"></div>

          <!-- Header row -->
          <div class="rec-card__header">
            <div class="rec-card__title-group">
              <div class="rec-card__branch">${sanitize(r.branch_name)}</div>
              <div class="rec-card__location">
                <i data-lucide="map-pin" style="width:12px;height:12px"></i>
                ${sanitize(r.city)}
              </div>
            </div>
            <div class="rec-card__badges">
              <span class="premium-badge premium-badge--${variant}">
                <i data-lucide="${riskIconMap[level]}" style="width:13px;height:13px"></i>
                ${sanitize(r.risk_level)} Risk
              </span>
              <span class="premium-badge premium-badge--neutral rec-card__conf-badge">
                <i data-lucide="${confIconMap[confLevel]}" style="width:13px;height:13px"></i>
                ${sanitize(confidence)}
              </span>
            </div>
          </div>

          <!-- Weather & Temperature row -->
          <div class="rec-card__weather-strip">
            <div class="rec-card__weather-main">
              <i data-lucide="${weatherIconName}" style="width:18px;height:18px"></i>
              <span class="rec-card__temp">${temp}\u00b0C</span>
              <span class="rec-card__weather-desc">${sanitize(weather)}</span>
            </div>
            ${upliftLabel ? `<span class="rec-card__uplift rec-card__uplift--${upliftClass}">${upliftLabel}</span>` : ''}
          </div>

          <!-- Key metrics grid -->
          <div class="rec-card__metrics">
            <div class="rec-card__metric">
              <div class="rec-card__metric-icon"><i data-lucide="package" style="width:16px;height:16px"></i></div>
              <div class="rec-card__metric-data">
                <span class="rec-card__metric-value">${stockOnHand}</span>
                <span class="rec-card__metric-label">On Hand</span>
              </div>
            </div>
            <div class="rec-card__metric">
              <div class="rec-card__metric-icon"><i data-lucide="truck" style="width:16px;height:16px"></i></div>
              <div class="rec-card__metric-data">
                <span class="rec-card__metric-value">${inTransit}</span>
                <span class="rec-card__metric-label">In Transit</span>
              </div>
            </div>
            <div class="rec-card__metric">
              <div class="rec-card__metric-icon"><i data-lucide="shield" style="width:16px;height:16px"></i></div>
              <div class="rec-card__metric-data">
                <span class="rec-card__metric-value">${safetyStock}</span>
                <span class="rec-card__metric-label">Safety Stock</span>
              </div>
            </div>
            <div class="rec-card__metric">
              <div class="rec-card__metric-icon"><i data-lucide="shopping-cart" style="width:16px;height:16px"></i></div>
              <div class="rec-card__metric-data">
                <span class="rec-card__metric-value">${lastSold}</span>
                <span class="rec-card__metric-label">Last Day Sold</span>
              </div>
            </div>
            <div class="rec-card__metric">
              <div class="rec-card__metric-icon"><i data-lucide="trending-up" style="width:16px;height:16px"></i></div>
              <div class="rec-card__metric-data">
                <span class="rec-card__metric-value">${avg7}</span>
                <span class="rec-card__metric-label">7-Day Avg</span>
              </div>
            </div>
            <div class="rec-card__metric rec-card__metric--accent">
              <div class="rec-card__metric-icon"><i data-lucide="target" style="width:16px;height:16px"></i></div>
              <div class="rec-card__metric-data">
                <span class="rec-card__metric-value">${predicted}</span>
                <span class="rec-card__metric-label">Predicted</span>
              </div>
            </div>
          </div>

          <!-- Stock coverage bar -->
          <div class="rec-card__coverage">
            <div class="rec-card__coverage-header">
              <span class="rec-card__coverage-label">Stock Coverage</span>
              <span class="rec-card__coverage-value">${Math.round(coverageRatio)}%</span>
            </div>
            <div class="rec-card__coverage-track">
              <div class="rec-card__coverage-fill rec-card__coverage-fill--${variant}" style="--fill-width: ${coverageRatio}%"></div>
            </div>
            ${stockGap > 0 ? `<span class="rec-card__coverage-gap">Gap: ${stockGap} units short</span>` : `<span class="rec-card__coverage-ok">Stock covers forecast</span>`}
          </div>

          <!-- Reorder decision -->
          ${reorderQty > 0 ? `
          <div class="rec-card__reorder">
            <div class="rec-card__reorder-top">
              <div class="rec-card__reorder-qty">
                <i data-lucide="package-plus" style="width:20px;height:20px"></i>
                <span class="rec-card__reorder-number">${reorderQty}</span>
                <span class="rec-card__reorder-unit">units</span>
              </div>
              <span class="rec-card__reorder-label">Recommended Reorder</span>
            </div>
            ${r.explanation ? `<p class="rec-card__reorder-reason"><i data-lucide="sparkles" style="width:12px;height:12px;flex-shrink:0"></i> ${sanitize(r.explanation)}</p>` : ''}
          </div>` : `
          <div class="rec-card__reorder rec-card__reorder--none">
            <div class="rec-card__reorder-top">
              <div class="rec-card__reorder-qty">
                <i data-lucide="check-circle" style="width:20px;height:20px"></i>
                <span class="rec-card__reorder-number">0</span>
                <span class="rec-card__reorder-unit">units</span>
              </div>
              <span class="rec-card__reorder-label">No reorder needed</span>
            </div>
            ${r.explanation ? `<p class="rec-card__reorder-reason"><i data-lucide="sparkles" style="width:12px;height:12px;flex-shrink:0"></i> ${sanitize(r.explanation)}</p>` : ''}
          </div>`}

          <!-- News sentiment section -->
          ${newsItems.length ? `
          <div class="rec-card__news">
            <div class="rec-card__news-header">
              <i data-lucide="${newsIcon}" style="width:14px;height:14px"></i>
              <span>Local News</span>
              <span class="premium-badge premium-badge--${newsSentimentVariant}" style="font-size:10px;min-height:22px;padding:0 8px;">${newsSentimentLabel}</span>
            </div>
            <ul class="rec-card__news-list">
              ${newsItems.map(n => `<li>${sanitize(n)}</li>`).join('')}
            </ul>
          </div>` : ''}
        </div>`;
    });

    // Build carousel HTML
    const cardsHtml = cards.map((html, idx) =>
      `<div class="rec-carousel__card ${idx === 0 ? 'is-active' : 'is-hidden'}" data-index="${idx}">${html}</div>`
    ).join('');

    const dotsHtml = cards.map((_, idx) =>
      `<button class="rec-carousel__dot ${idx === 0 ? 'rec-carousel__dot--active' : ''}" data-goto="${idx}" aria-label="Go to store ${idx + 1}"></button>`
    ).join('');

    container.innerHTML = `
      <div class="rec-carousel" id="recCarousel">
        <div class="rec-carousel__viewport">
          ${cardsHtml}
        </div>
        <div class="rec-carousel__nav">
          <button class="rec-carousel__arrow" data-dir="prev" aria-label="Previous store">
            <i data-lucide="chevron-left" style="width:20px;height:20px"></i>
          </button>
          <div class="rec-carousel__dots">
            ${dotsHtml}
          </div>
          <button class="rec-carousel__arrow" data-dir="next" aria-label="Next store">
            <i data-lucide="chevron-right" style="width:20px;height:20px"></i>
          </button>
          <span class="rec-carousel__counter"><span id="carouselCurrent">1</span> / ${cards.length}</span>
        </div>
      </div>`;

    // Re-initialize Lucide icons for newly injected SVGs
    if (window.lucide) window.lucide.createIcons();

    // Wire up carousel interactivity
    initCarousel(cards.length);
  }

  // ---- Carousel Logic -------------------------------------------------------
  let carouselIndex = 0;
  let carouselAnimating = false;

  function initCarousel(total) {
    const carousel = document.getElementById('recCarousel');
    if (!carousel) return;

    carousel.addEventListener('click', function (e) {
      const arrow = e.target.closest('.rec-carousel__arrow');
      if (arrow) {
        const dir = arrow.dataset.dir;
        if (dir === 'next') goToCard((carouselIndex + 1) % total, 'next');
        else goToCard((carouselIndex - 1 + total) % total, 'prev');
        return;
      }
      const dot = e.target.closest('.rec-carousel__dot');
      if (dot) {
        const goto = parseInt(dot.dataset.goto, 10);
        if (goto !== carouselIndex) goToCard(goto, goto > carouselIndex ? 'next' : 'prev');
      }
    });

    // Keyboard navigation
    carousel.setAttribute('tabindex', '0');
    carousel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') goToCard((carouselIndex + 1) % total, 'next');
      else if (e.key === 'ArrowLeft') goToCard((carouselIndex - 1 + total) % total, 'prev');
    });
  }

  function goToCard(newIndex, direction) {
    if (carouselAnimating || newIndex === carouselIndex) return;
    carouselAnimating = true;

    const carousel = document.getElementById('recCarousel');
    const allCards = carousel.querySelectorAll('.rec-carousel__card');
    const oldCard = allCards[carouselIndex];
    const newCard = allCards[newIndex];

    // Set animation classes
    const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
    const inClass  = direction === 'next' ? 'slide-in-right' : 'slide-in-left';

    oldCard.classList.remove('is-active');
    oldCard.classList.add(outClass);

    newCard.classList.remove('is-hidden');
    newCard.classList.add(inClass);

    // Update dots
    carousel.querySelectorAll('.rec-carousel__dot').forEach((d, i) => {
      d.classList.toggle('rec-carousel__dot--active', i === newIndex);
    });

    // Update counter
    const counter = document.getElementById('carouselCurrent');
    if (counter) counter.textContent = newIndex + 1;

    // After animation
    setTimeout(function () {
      oldCard.classList.remove(outClass);
      oldCard.classList.add('is-hidden');
      newCard.classList.remove(inClass);
      newCard.classList.add('is-active');
      carouselIndex = newIndex;
      carouselAnimating = false;
    }, 350);
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
            pointStyle: 'rectRounded',
            color: '#4b5563'
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
          grid: { color: 'rgba(0,0,0,0.05)' },
          border: { display: false }
        }
      }
    };
  }

  // ---- Pipeline animation ----------------------------------------------------
  const PIPELINE_ICONS = {
    get_branches:           'database',
    get_sales_recent:       'shopping-cart',
    get_inventory:          'package',
    azure_maps_weather:     'cloud-sun',
    compose_predicted_units:'calculator',
    autonomous_agent:       'brain',
    create_blobs:           'hard-drive'
  };

  function renderPipeline(data) {
    const steps = data.workflowsteps || [];
    const runs  = data.workflowruns || [];
    const track = document.getElementById('pipelineTrack');
    if (!track) return;

    // Get the latest run's steps
    const latestRun = runs.length
      ? [...runs].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0]
      : null;

    let runSteps = [];
    if (latestRun) {
      runSteps = steps.filter(s => s.run_id === latestRun.run_id);
    }
    // If no matching steps, use the first run's steps from workflow_steps
    if (!runSteps.length && steps.length) {
      const firstRunId = steps[0].run_id;
      runSteps = steps.filter(s => s.run_id === firstRunId);
    }
    if (!runSteps.length) {
      // Fallback: define the standard pipeline phases
      runSteps = [
        { step_name: 'Load Data',       action: 'get_branches',           status: 'Succeeded' },
        { step_name: 'Load Sales',      action: 'get_sales_recent',       status: 'Succeeded' },
        { step_name: 'Load Inventory',  action: 'get_inventory',          status: 'Succeeded' },
        { step_name: 'Weather',         action: 'azure_maps_weather',     status: 'Succeeded' },
        { step_name: 'Demand Calc',     action: 'compose_predicted_units',status: 'Succeeded' },
        { step_name: 'AI Agent',        action: 'autonomous_agent',       status: 'Succeeded' },
        { step_name: 'Write Output',    action: 'create_blobs',           status: 'Succeeded' }
      ];
    }

    // Sort by started_at
    runSteps.sort((a, b) => new Date(a.started_at || 0) - new Date(b.started_at || 0));

    track.innerHTML = runSteps.map((step, i) => {
      const icon = PIPELINE_ICONS[step.action] || 'circle';
      const isLast = i === runSteps.length - 1;
      return `
        <div class="pipeline__step" data-index="${i}">
          <div class="pipeline__node pipeline__node--pending">
            <i data-lucide="${icon}" style="width:18px;height:18px"></i>
          </div>
          <div class="pipeline__label">${sanitize(step.step_name)}</div>
          <div class="pipeline__status-text" data-step-status></div>
        </div>
        ${!isLast ? '<div class="pipeline__connector" data-index="' + i + '"><div class="pipeline__connector-fill"></div></div>' : ''}`;
    }).join('');

    // Re-init lucide icons for the pipeline
    if (window.lucide) window.lucide.createIcons();

    // Animate after a short delay
    animatePipeline(runSteps);

    // Replay button
    const replayBtn = document.getElementById('pipelineReplayBtn');
    if (replayBtn) {
      replayBtn.onclick = function () {
        // Reset all nodes
        track.querySelectorAll('.pipeline__node').forEach(n => {
          n.className = 'pipeline__node pipeline__node--pending';
        });
        track.querySelectorAll('.pipeline__connector-fill').forEach(f => {
          f.style.width = '0%';
        });
        track.querySelectorAll('[data-step-status]').forEach(s => {
          s.textContent = '';
          s.className = '';
        });
        setTimeout(() => animatePipeline(runSteps), 300);
      };
    }
  }

  function animatePipeline(steps) {
    const STEP_DELAY = 600;  // ms between each step starting
    const RUN_DURATION = 400; // ms a step shows "running" before completing

    steps.forEach((step, i) => {
      const nodeEl = document.querySelector(`.pipeline__step[data-index="${i}"] .pipeline__node`);
      const statusEl = document.querySelector(`.pipeline__step[data-index="${i}"] [data-step-status]`);
      const connFill = document.querySelector(`.pipeline__connector[data-index="${i}"] .pipeline__connector-fill`);
      if (!nodeEl) return;

      const startTime = i * STEP_DELAY;
      const ok = (step.status || '').toLowerCase() === 'succeeded';

      // Phase 1: start running
      setTimeout(() => {
        nodeEl.className = 'pipeline__node pipeline__node--running';
        if (statusEl) { statusEl.textContent = 'Running…'; statusEl.className = 'pipeline__status-text pipeline__status-text--running'; }
      }, startTime);

      // Phase 2: complete
      setTimeout(() => {
        nodeEl.className = ok ? 'pipeline__node pipeline__node--success' : 'pipeline__node pipeline__node--failed';
        if (statusEl) {
          statusEl.textContent = ok ? 'Done' : 'Failed';
          statusEl.className = ok ? 'pipeline__status-text pipeline__status-text--success' : 'pipeline__status-text pipeline__status-text--failed';
        }
        // Animate connector fill
        if (connFill) {
          connFill.style.transition = `width ${STEP_DELAY * 0.6}ms var(--ease-out)`;
          connFill.style.width = '100%';
        }
      }, startTime + RUN_DURATION);
    });
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
    document.getElementById('chatPanel').classList.toggle('chat-panel--open', chatOpen);
    document.getElementById('chatFab').classList.toggle('chat-fab--hidden', chatOpen);
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

  // ---- AI Summary Banner ----------------------------------------------------
  function renderAISummary(data) {
    const repl = data.replenishmentoutput || [];
    const forecast = data.forecastoutput || [];
    const el = document.getElementById('aiBannerText');
    if (!el) return;

    if (!repl.length) {
      el.innerHTML = 'No run data available yet. Waiting for the next nightly planning cycle.';
      return;
    }

    const high = repl.filter(r => (r.risk_level || '').toLowerCase() === 'high');
    const totalQty = repl.reduce((s, r) => s + (r.recommended_order_qty || 0), 0);
    const temps = forecast.map(f => f.tomorrow_max_temp_c).filter(Boolean);
    const maxTemp = temps.length ? Math.max(...temps) : null;
    const hotCity = maxTemp ? forecast.find(f => f.tomorrow_max_temp_c === maxTemp) : null;

    let msg = `<strong>${repl.length} stores</strong> analyzed. `;
    if (high.length) {
      msg += `<strong>${high.length} high-risk</strong> store${high.length > 1 ? 's' : ''} flagged — `;
      msg += high.map(h => h.city).join(', ') + '. ';
    } else {
      msg += 'All stores are within safe stock levels. ';
    }
    if (totalQty > 0) msg += `Total reorder: <strong>${totalQty} units</strong>. `;
    if (hotCity) msg += `Hottest: ${hotCity.city} at <strong>${maxTemp}\u00b0C</strong>.`;

    el.innerHTML = msg;
  }

  // ---- Run Strip ------------------------------------------------------------
  function renderRunStrip(data) {
    const runs = data.workflowruns || [];
    if (!runs.length) return;

    const last = [...runs].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0];

    setText('runTime', formatTimestamp(last.started_at || last.timestamp || ''));
    setText('runStatus', last.status || '\u2014');
    setText('runDuration', last.duration_seconds ? last.duration_seconds + 's' : '\u2014');
    setText('runStores', last.branches_evaluated || '\u2014');
    setText('runFlagged', last.flagged_branches || '0');
    setText('lastRunLabel', formatTimestamp(last.started_at || last.timestamp || ''));

    // Color the status
    const statusEl = document.getElementById('runStatus');
    if (statusEl) {
      statusEl.classList.toggle('run-strip__value--success', (last.status || '').toLowerCase() === 'succeeded');
      statusEl.classList.toggle('run-strip__value--danger', (last.status || '').toLowerCase() !== 'succeeded');
    }
  }

  // ---- Weather Grid (insight tab) ------------------------------------------
  function renderWeatherGrid(data) {
    const forecast = data.forecastoutput || [];
    const el = document.getElementById('weatherGrid');
    if (!el || !forecast.length) return;

    el.innerHTML = forecast.map(f => {
      const temp = f.tomorrow_max_temp_c;
      const tempClass = temp > 30 ? 'hot' : temp >= 27 ? 'warm' : 'mild';
      let uplift = '';
      let upliftStyle = '';
      if (temp > 30) { uplift = '+22%'; upliftStyle = 'background:rgba(248,113,113,0.12);color:#f87171'; }
      else if (temp >= 27) { uplift = '+12%'; upliftStyle = 'background:rgba(251,191,36,0.12);color:#fbbf24'; }
      else { uplift = '0%'; upliftStyle = 'background:rgba(100,116,139,0.1);color:#64748b'; }

      return `
        <div class="weather-card">
          <div class="weather-card__city">${sanitize(f.city || f.branch_name)}</div>
          <div class="weather-card__temp weather-card__temp--${tempClass}">${temp}\u00b0C</div>
          <div class="weather-card__condition">${sanitize(f.weather_condition || '')}</div>
          <div class="weather-card__uplift" style="${upliftStyle}">Heat uplift: ${uplift}</div>
        </div>`;
    }).join('');
  }

  // ---- Insight Tabs ---------------------------------------------------------
  function initInsightTabs() {
    const nav = document.getElementById('insightTabNav');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
      const btn = e.target.closest('.insight-tab');
      if (!btn) return;
      const tabId = btn.dataset.tab;
      nav.querySelectorAll('.insight-tab').forEach(t => t.classList.remove('insight-tab--active'));
      btn.classList.add('insight-tab--active');
      document.querySelectorAll('.insight-pane').forEach(p => p.classList.remove('insight-pane--active'));
      const pane = document.getElementById('pane-' + tabId);
      if (pane) pane.classList.add('insight-pane--active');
    });
  }

  // ---- Rec Filter Chips -----------------------------------------------------
  function initRecFilters() {
    const container = document.getElementById('recFilters');
    if (!container) return;
    container.addEventListener('click', function (e) {
      const chip = e.target.closest('.rec-filter-chip');
      if (!chip) return;
      container.querySelectorAll('.rec-filter-chip').forEach(c => c.classList.remove('rec-filter-chip--active'));
      chip.classList.add('rec-filter-chip--active');
      const filter = chip.dataset.filter;
      const carousel = document.getElementById('recCarousel');
      if (!carousel) return;
      const allCards = carousel.querySelectorAll('.rec-carousel__card');
      const filterMap = { high: 'danger', medium: 'warning', low: 'success' };
      // Find first matching card and navigate to it
      let firstMatch = -1;
      allCards.forEach((card, i) => {
        const recCard = card.querySelector('.rec-card');
        if (!recCard) return;
        if (filter === 'all') { firstMatch = firstMatch === -1 ? i : firstMatch; return; }
        const isMatch = recCard.classList.contains('rec-card--' + (filterMap[filter] || ''));
        if (isMatch && firstMatch === -1) firstMatch = i;
      });
      if (firstMatch >= 0 && firstMatch !== carouselIndex) {
        goToCard(firstMatch, firstMatch > carouselIndex ? 'next' : 'prev');
      }
    });
  }

  // ---- Count-Up Animation ---------------------------------------------------
  function animateCountUp(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const num = parseInt(target, 10);
    if (isNaN(num) || num === 0) { el.textContent = target; return; }
    const duration = 800;
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * num).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ---- Prompt Pills ---------------------------------------------------------
  function askPrompt(btn) {
    const text = btn.textContent.trim();
    if (!text) return;
    // Open chat if not open
    if (!chatOpen) toggleChat();
    const input = document.getElementById('chatInput');
    input.value = text;
    document.getElementById('chatForm').dispatchEvent(new Event('submit'));
  }

  // ---- Hero Canvas (ambient dot network) -----------------------------------
  function renderHeroCanvas() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const wrapper = canvas.parentElement;
    let w, h, dots = [];

    function resize() {
      w = wrapper.offsetWidth;
      h = wrapper.offsetHeight;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    resize();

    // Create dots
    for (let i = 0; i < 40; i++) {
      dots.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, r: 2 + Math.random() * 2 });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      // Lines
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x;
          const dy = dots[i].y - dots[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(dots[i].x, dots[i].y);
            ctx.lineTo(dots[j].x, dots[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      // Dots
      dots.forEach(d => {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < 0 || d.x > w) d.vx *= -1;
        if (d.y < 0 || d.y > h) d.vy *= -1;
      });
      requestAnimationFrame(draw);
    }
    draw();
    window.addEventListener('resize', resize);
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

      // Fallback: read from env.js ONLY if server config didn't provide the key
      if (!AZURE_MAPS_KEY) {
        const env = window.__ENV__ || {};
        if (env.AZURE_MAPS_KEY) AZURE_MAPS_KEY = env.AZURE_MAPS_KEY;
      }

      const data = await loadAllData();
      dashboardData = data;

      renderKPIs(data);
      renderAISummary(data);
      renderRunStrip(data);
      renderMap(data);
      renderRecommendations(data);
      renderSalesChart(data);
      renderStockChart(data);
      renderWeatherGrid(data);
      renderTimeline(data);
      renderPipeline(data);
    } catch (err) {
      console.error('Dashboard init error:', err);
    }
  }

  // Expose API
  window.app = { refresh: init, toggleChat: toggleChat, askPrompt: askPrompt };

  // Go
  initChat();
  initInsightTabs();
  initRecFilters();
  renderHeroCanvas();
  init();
})();
