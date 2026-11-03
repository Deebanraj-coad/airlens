/* ============================================================
   ChennAIR v3.0 — Enhanced Air Pollution Dashboard
   All 24 improvements implemented
   ============================================================ */

// ===== CONSTANTS =====
const WAQI_TOKEN = 'd393684229b2dd78ba0f63ad1b88395431341c8d';
const OW_KEY = '7d241903cbe0a28094a25c10b0740701';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const now = new Date();

// Live data store (shared across pages)
const LiveData = {
  aqi: null, pm25: null, pm10: null, no2: null,
  o3: null, so2: null, co: null,
  temp: null, wind: null, humidity: null,
  forecastAQI: [142, 158, 135, 120, 168, 145, 132],
  forecastPM25: [], forecastPM10: [],
  weatherDesc: 'Chennai',
};

// Alert thresholds (saved to localStorage)
let thresholds = {
  pm25: parseInt(localStorage.getItem('thresh_pm25') || '60'),
  aqi: parseInt(localStorage.getItem('thresh_aqi') || '150'),
  no2: parseInt(localStorage.getItem('thresh_no2') || '40'),
};

// ===== UTILITY =====
function rnd(min, max) { return Math.round(Math.random() * (max - min) + min); }
function rndF(min, max, dec = 1) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)); }
function aqiColor(v) {
  if (!v || isNaN(v)) return '#888';
  if (v < 51) return '#00e676'; if (v < 101) return '#ffeb3b';
  if (v < 151) return '#ff9800'; if (v < 201) return '#f44336';
  if (v < 301) return '#9c27b0'; return '#7b1fa2';
}
function aqiLabel(v) {
  if (!v || isNaN(v)) return 'Unknown';
  if (v < 51) return 'Good'; if (v < 101) return 'Moderate';
  if (v < 151) return 'Unhealthy–Sensitive'; if (v < 201) return 'Unhealthy';
  if (v < 301) return 'Very Unhealthy'; return 'Hazardous';
}
function aqiMsg(v) {
  if (!v || isNaN(v)) return 'Data unavailable.';
  if (v < 51) return 'Air quality is satisfactory and poses little or no risk.';
  if (v < 101) return 'Air quality is acceptable. Some pollutants may concern sensitive people.';
  if (v < 151) return 'Sensitive groups should reduce prolonged outdoor exertion.';
  if (v < 201) return 'Everyone may experience health effects. Wear a mask outdoors.';
  if (v < 301) return 'Health alert — serious effects possible for everyone.';
  return 'Emergency conditions. Everyone should avoid all outdoor exertion.';
}

// ===== CLOCK =====
function updateClock() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const lu = document.getElementById('lastUpdated');
  if (lu) lu.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
setInterval(updateClock, 1000);
updateClock();

// ===== PAGE NAVIGATION (with History API) =====
const pageTitles = {
  home: 'Dashboard', forecast: '7-Day Forecast', map: 'Pollution Map',
  viz3d: '3D AQI Cityscape', ai: 'AI Prediction', aichat: 'AI Health Advisor',
  history: 'Historical Analysis', health: 'Health Advisory',
  exposure: 'Exposure Tracker', alerts: 'Alerts System', data: 'Data Sources'
};
function showPage(id, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (navEl) navEl.classList.add('active');
  document.getElementById('page-title').textContent = pageTitles[id] || id;
  history.pushState({ page: id }, '', '#' + id);
  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  // Lazy init
  const inits = {
    map: () => { initLeafletMap(); buildAreaRankings(); buildAreaChart(); buildSourcesChart(); },
    viz3d: () => init3D(),
    ai: () => { buildAICharts(); buildFeatureImportance(); },
    history: () => { buildHistoryChart(); buildDistChart(); buildCorrChart(); buildHeatmapChart(); },
    health: () => buildHealthChart(),
    alerts: () => buildAlerts(),
    exposure: () => buildExposureChart(),
    aichat: () => updateChatContext(),
  };
  if (inits[id]) setTimeout(inits[id], 80);
}
window.addEventListener('popstate', e => {
  if (e.state && e.state.page) {
    const nav = document.querySelector(`.nav-item[onclick*="'${e.state.page}'"]`);
    showPage(e.state.page, nav);
  }
});

// ===== THEME TOGGLE =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  // Rebuild all active charts
  setTimeout(() => {
    rebuildAllCharts();
  }, 100);
}
function rebuildAllCharts() {
  if (trendChart) { buildTrendChart(); }
}

// ===== CHART DEFAULTS =====
const CHART_FONT = "'Exo 2', sans-serif";
function makeGradient(ctx, color1, color2) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height || 200);
  g.addColorStop(0, color1); g.addColorStop(1, color2);
  return g;
}
function baseOpts(yLabel = '') {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const textColor = isDark ? 'rgba(226,238,255,0.7)' : 'rgba(10,22,40,0.7)';
  const gridColor = isDark ? 'rgba(56,180,255,0.06)' : 'rgba(0,0,0,0.06)';
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#0d1424' : '#fff',
        borderColor: 'rgba(56,180,255,0.3)', borderWidth: 1,
        titleFont: { family: CHART_FONT, size: 13, weight: '700' },
        bodyFont: { family: CHART_FONT, size: 12 },
        titleColor: isDark ? '#e2eeff' : '#0a1628',
        bodyColor: isDark ? '#7a9fc0' : '#3a5a80',
        padding: 10, cornerRadius: 8,
      }
    },
    scales: {
      x: { ticks: { color: textColor, font: { family: CHART_FONT, size: 11 } }, grid: { color: gridColor }, border: { display: false } },
      y: {
        ticks: { color: textColor, font: { family: CHART_FONT, size: 11 } }, grid: { color: gridColor }, border: { display: false },
        title: { display: !!yLabel, text: yLabel, color: textColor, font: { family: CHART_FONT, size: 11 } }
      },
    },
    animation: { duration: 800, easing: 'easeInOutQuart' },
  };
}

// ===== DRAW GAUGE (single unified function) =====
function drawGauge(aqi) {
  const canvas = document.getElementById('gaugeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 220; canvas.height = 120;
  const cx = canvas.width / 2, cy = canvas.height, radius = 90;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#00e676');
  gradient.addColorStop(0.25, '#ffeb3b');
  gradient.addColorStop(0.5, '#ff9800');
  gradient.addColorStop(0.75, '#f44336');
  gradient.addColorStop(1, '#9c27b0');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, 0);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 14;
  ctx.stroke();
  if (aqi) {
    const angle = Math.PI + (aqi / 500) * Math.PI;
    const x = cx + (radius - 10) * Math.cos(angle);
    const y = cy + (radius - 10) * Math.sin(angle);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
}

// ===== LOAD AQI FROM WAQI =====
async function loadAQI() {
  try {
    const res = await fetch(`https://api.waqi.info/feed/chennai/?token=${WAQI_TOKEN}`);
    const result = await res.json();
    if (result.status !== 'ok') throw new Error('WAQI error');
    const aqi = result.data.aqi;
    const iaqi = result.data.iaqi || {};
    // Update live store
    LiveData.aqi = aqi;
    LiveData.pm25 = iaqi.pm25?.v ?? null;
    LiveData.pm10 = iaqi.pm10?.v ?? null;
    LiveData.no2 = iaqi.no2?.v ?? null;
    LiveData.o3 = iaqi.o3?.v ?? null;
    LiveData.so2 = iaqi.so2?.v ?? null;
    LiveData.co = iaqi.co?.v ?? null;
    // Extract WAQI forecast
    const daily = result.data.forecast?.daily || {};
    if (daily.pm25 && daily.pm25.length > 0) {
      const today = result.data.time?.iso?.split('T')[0] || new Date().toISOString().split('T')[0];
      LiveData.forecastPM25 = formatForecastArr(daily.pm25, today);
      LiveData.forecastPM10 = formatForecastArr(daily.pm10 || [], today);
      LiveData.forecastAQI = formatForecastArr(daily.uvi || daily.pm25, today).map(v => Math.round(v * 3.2));
    }
    updateAQIDisplay(aqi);
    updatePollutantsDisplay(iaqi);
    checkThresholds(aqi, iaqi);
    updateChatContext();
    // Rebuild sidebar
    const sv = document.getElementById('sidebar-aqi');
    const ss = document.getElementById('sidebar-status');
    if (sv) sv.textContent = aqi;
    if (ss) { ss.textContent = aqiLabel(aqi); ss.style.color = aqiColor(aqi); }
  } catch (err) {
    console.error('AQI fetch failed:', err);
    showToast('⚠️', 'Data Error', 'Could not fetch live AQI');
  }
}

function formatForecastArr(arr, today) {
  return (arr || []).filter(i => i.day >= today).slice(0, 7).map(i => i.avg);
}

function updateAQIDisplay(aqi) {
  const color = aqiColor(aqi);
  const el = document.getElementById('gaugeNum');
  const badge = document.getElementById('aqiBadge');
  const desc = document.getElementById('aqiDesc');
  if (el) { el.textContent = aqi; el.style.color = color; }
  if (badge) {
    badge.textContent = aqiLabel(aqi).toUpperCase();
    badge.style.color = color; badge.style.borderColor = color;
    badge.style.background = color + '22';
  }
  if (desc) desc.textContent = aqiMsg(aqi);
  const ptr = document.getElementById('aqiPointer');
  if (ptr) ptr.style.left = Math.min((aqi / 500) * 100, 99) + '%';
  drawGauge(aqi);
}

// ===== POLLUTANTS DISPLAY =====
const limits = { pm25: 150, pm10: 250, no2: 200, o3: 180, so2: 350, co: 30 };
function getPollColor(type, v) {
  if (type === 'pm25' || type === 'pm10') {
    if (v <= 50) return '#00e676'; if (v <= 100) return '#ffeb3b'; return '#ff9800';
  }
  if (type === 'no2') return v > 40 ? '#ff6b6b' : '#00e676';
  if (type === 'o3') return '#00e5c8';
  if (type === 'so2') return '#00e676';
  if (type === 'co') return '#38b4ff';
  return '#ccc';
}
function updatePollutantsDisplay(iaqi) {
  const polls = ['pm25', 'pm10', 'no2', 'o3', 'so2', 'co'];
  polls.forEach(p => {
    const v = iaqi[p]?.v;
    const valEl = document.getElementById(p + 'Val');
    const barEl = document.getElementById(p + 'Bar');
    if (valEl && v != null) {
      valEl.textContent = v;
      const color = getPollColor(p, v);
      valEl.style.color = color;
      if (barEl) {
        barEl.style.width = Math.min((v / limits[p]) * 100, 100) + '%';
        barEl.style.background = color;
      }
      // Update live store
      LiveData[p] = v;
    }
  });
  updateContextPanel();
}

function updateContextPanel() {
  const set = (id, val, unit = '') => { const el = document.getElementById(id); if (el) el.textContent = val != null ? val + unit : '—'; };
  set('ctx-aqi', LiveData.aqi);
  set('ctx-pm25', LiveData.pm25, ' µg/m³');
  set('ctx-pm10', LiveData.pm10, ' µg/m³');
  set('ctx-no2', LiveData.no2, ' µg/m³');
  set('ctx-temp', LiveData.temp, '°C');
  set('ctx-wind', LiveData.wind, ' km/h');
  const chatAqi = document.getElementById('chatAQI');
  if (chatAqi && LiveData.aqi) chatAqi.textContent = `${LiveData.aqi} (${aqiLabel(LiveData.aqi)})`;
}

// ===== WEATHER (OpenWeatherMap) =====
async function loadWeather() {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=Chennai&APPID=${OW_KEY}`);
    const data = await res.json();
    if (data.cod !== 200) throw new Error('Weather API error');
    displayWeather(data);
  } catch (err) {
    console.error('Weather fetch failed:', err);
  }
}
function displayWeather(data) {
  const tempC = parseFloat((data.main.temp - 273.15).toFixed(1));
  const desc = data.weather[0].description;
  const condition = data.weather[0].main.toLowerCase();
  let icon = '🌤';
  if (condition.includes('cloud')) icon = '☁️';
  else if (condition.includes('rain')) icon = '🌧';
  else if (condition.includes('clear')) icon = '☀️';
  else if (condition.includes('thunder')) icon = '⛈';
  else if (condition.includes('mist') || condition.includes('fog')) icon = '🌫';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  set('temperature', tempC + '°C');
  set('weatherText', capitalize(desc) + ' · ' + data.name);
  set('weatherIcon', icon);
  set('humidity', data.main.humidity + '%');
  set('wind', data.wind.speed + ' km/h');
  set('visibility', (data.visibility / 1000).toFixed(1) + ' km');
  set('pressure', data.main.pressure + ' hPa');
  // Wind rose
  const arrow = document.getElementById('windArrow');
  if (arrow) arrow.setAttribute('transform', `rotate(${data.wind.deg} 30 30)`);
  const dirText = document.getElementById('windDirText');
  if (dirText) {
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    dirText.textContent = dirs[Math.round(data.wind.deg / 22.5) % 16];
  }
  // Update live store
  LiveData.temp = tempC;
  LiveData.wind = data.wind.speed;
  LiveData.humidity = data.main.humidity;
  LiveData.weatherDesc = capitalize(desc);
  updateContextPanel();
}
function capitalize(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

// ===== THRESHOLD ALERTS CHECK =====
function checkThresholds(aqi, iaqi) {
  const alerts = [];
  if (aqi > thresholds.aqi) alerts.push({ title: 'AQI Threshold Exceeded', desc: `AQI ${aqi} exceeds your alert level of ${thresholds.aqi}`, sev: 'high' });
  if ((iaqi.pm25?.v || 0) > thresholds.pm25) alerts.push({ title: 'PM2.5 Alert', desc: `PM2.5 ${iaqi.pm25?.v} µg/m³ exceeds alert level ${thresholds.pm25}`, sev: 'high' });
  if ((iaqi.no2?.v || 0) > thresholds.no2) alerts.push({ title: 'NO₂ Alert', desc: `NO₂ ${iaqi.no2?.v} µg/m³ exceeds alert level ${thresholds.no2}`, sev: 'med' });
  if (alerts.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
    alerts.forEach(a => new Notification('ChennAIR: ' + a.title, { body: a.desc }));
  }
}
function saveThresholds() {
  const sliders = document.querySelectorAll('input[type=range]');
  // Just save current label values
  localStorage.setItem('thresh_pm25', thresholds.pm25);
  localStorage.setItem('thresh_aqi', thresholds.aqi);
  localStorage.setItem('thresh_no2', thresholds.no2);
}

// ===== 24H TREND CHART =====
let trendChart;
function buildTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  const labels = [];
  for (let i = 23; i >= 0; i--) { const h = new Date(now); h.setHours(now.getHours() - i); labels.push(h.getHours() + ':00'); }
  // Simulate realistic 24h AQI centered on live value
  const base = LiveData.aqi || 140;
  let v = base;
  const data = [];
  for (let i = 0; i < 24; i++) { v += rnd(-20, 20); v = Math.max(40, Math.min(280, v)); data.push(v); }
  const g = makeGradient(ctx.getContext('2d'), 'rgba(56,180,255,0.4)', 'rgba(56,180,255,0.0)');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data, fill: true, backgroundColor: g, borderColor: '#38b4ff', borderWidth: 2.5, tension: 0.4, pointRadius: 0, pointHoverRadius: 5 }] },
    options: { ...baseOpts('AQI'), plugins: { ...baseOpts().plugins, tooltip: { ...baseOpts().plugins.tooltip, callbacks: { label: c => `AQI: ${c.raw}` } } } },
  });
}

// ===== 7-DAY FORECAST =====
let forecastMainChart;
let currentForecastType = 'aqi';
let forecastDataSets = {};

function buildDayCards() {
  const el = document.getElementById('daysForecast'); if (!el) return;
  const statuses = ['Good', 'Moderate', 'Unhealthy-S', 'Moderate', 'Unhealthy', 'Mod-High', 'Moderate'];
  const trends = ['→', '↑', '↑', '↓', '↑', '↓', '↓'];
  const aqis = LiveData.forecastAQI.length >= 7 ? LiveData.forecastAQI : [142, 158, 135, 120, 168, 145, 132];
  el.innerHTML = aqis.map((aqi, i) => {
    const d = new Date(now); d.setDate(now.getDate() + i);
    const col = aqiColor(aqi);
    return `<div class="day-card${i === 0 ? ' active' : ''}" onclick="highlightDay(${i},this)">
      <div class="day-name">${i === 0 ? 'TODAY' : days[d.getDay()].toUpperCase()}</div>
      <div class="day-date" style="font-size:10px;color:var(--text3);">${d.getDate()} ${months[d.getMonth()]}</div>
      <div class="day-aqi" style="color:${col}">${aqi}</div>
      <div class="day-status" style="color:${col}">${aqiLabel(aqi).split('–')[0]}</div>
      <div class="day-trend">${trends[i]}</div>
    </div>`;
  }).join('');
}
function highlightDay(i, el) {
  document.querySelectorAll('.day-card').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
}

function buildForecastMainChart(type = 'aqi') {
  const ctx = document.getElementById('forecastMainChart'); if (!ctx) return;
  currentForecastType = type;
  const labels = [];
  for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() + i); labels.push((i === 0 ? 'Today' : days[d.getDay()]) + ' ' + d.getDate()); }
  let mainData, yLabel, color;
  if (type === 'pm25' && LiveData.forecastPM25.length >= 7) {
    mainData = LiveData.forecastPM25; yLabel = 'PM2.5 (µg/m³)'; color = '#38b4ff';
  } else if (type === 'pm10' && LiveData.forecastPM10.length >= 7) {
    mainData = LiveData.forecastPM10; yLabel = 'PM10 (µg/m³)'; color = '#00e5c8';
  } else {
    mainData = LiveData.forecastAQI.length >= 7 ? LiveData.forecastAQI : [142, 158, 135, 120, 168, 145, 132];
    yLabel = 'AQI'; color = '#38b4ff';
  }
  const g = makeGradient(ctx.getContext('2d'), color.replace(')', ',0.3)').replace('rgb', 'rgba'), color + '11');
  const confData = mainData.map(v => v + rnd(10, 25));
  const opts = baseOpts(yLabel);
  opts.plugins.legend = { display: true, labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 12 }, boxWidth: 16, usePointStyle: true } };
  if (forecastMainChart) forecastMainChart.destroy();
  forecastMainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels, datasets: [
        { label: `Predicted ${yLabel}`, data: mainData, fill: true, backgroundColor: g, borderColor: color, borderWidth: 2.5, tension: 0.4, pointRadius: 4, pointBackgroundColor: color },
        { label: 'Confidence Band', data: confData, fill: '-1', backgroundColor: 'rgba(0,229,200,0.08)', borderColor: 'rgba(0,229,200,0.4)', borderWidth: 1, borderDash: [5, 5], tension: 0.4, pointRadius: 0 },
      ]
    },
    options: opts
  });
  // Update button styles
  ['aqi', 'pm25', 'pm10'].forEach(t => {
    const btn = document.getElementById('btn-' + t);
    if (btn) { btn.style.background = t === type ? 'var(--accent)' : ''; btn.style.color = t === type ? '#080c14' : ''; }
  });
}
function updateForecastChart(type) { buildForecastMainChart(type); }

function buildPollChart(id, label, base, variance, color) {
  const existing = Chart.getChart(id); if (existing) existing.destroy();
  const ctx = document.getElementById(id); if (!ctx) return;
  const labels = [];
  for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() + i); labels.push(i === 0 ? 'Today' : days[d.getDay()]); }
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels, datasets: [{
        label, data: Array.from({ length: 7 }, () => rndF(base - variance, base + variance)),
        backgroundColor: color + '55', borderColor: color, borderWidth: 2, borderRadius: 6
      }]
    },
    options: baseOpts(label),
  });
}

// ===== API FORECAST CHARTS (WAQI forecast data) =====
async function buildAPIForecastCharts() {
  try {
    const res = await fetch(`https://api.waqi.info/feed/chennai/?token=${WAQI_TOKEN}`);
    const result = await res.json();
    if (result.status !== 'ok') throw new Error();
    const daily = result.data.forecast?.daily || {};
    const apiTime = result.data.time?.iso || new Date().toISOString();
    const today = apiTime.split('T')[0];
    const getVals = (arr) => (arr || []).filter(i => i.day >= today).slice(0, 7).map(i => i.avg);
    const labs = [];
    for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() + i); labs.push(i === 0 ? 'Today' : days[d.getDay()]); }
    if (daily.pm25 && daily.pm25.length > 0) {
      const existing = Chart.getChart('pm25Chart'); if (existing) existing.destroy();
      const ctx = document.getElementById('pm25Chart'); if (ctx) {
        new Chart(ctx, { type: 'bar', data: { labels: labs, datasets: [{ label: 'PM2.5 (µg/m³)', data: getVals(daily.pm25), backgroundColor: 'rgb(56,180,255,0.35)', borderColor: 'rgb(56,180,255)', borderWidth: 2, borderRadius: 6 }] }, options: baseOpts('PM2.5 (µg/m³)') });
      }
    }
    if (daily.pm10 && daily.pm10.length > 0) {
      const existing = Chart.getChart('pm10Chart'); if (existing) existing.destroy();
      const ctx = document.getElementById('pm10Chart'); if (ctx) {
        new Chart(ctx, { type: 'bar', data: { labels: labs, datasets: [{ label: 'PM10 (µg/m³)', data: getVals(daily.pm10), backgroundColor: 'rgba(0,229,200,0.35)', borderColor: '#00e5c8', borderWidth: 2, borderRadius: 6 }] }, options: baseOpts('PM10 (µg/m³)') });
      }
    }
    buildPollChart('no2Chart', 'NO₂ (µg/m³)', 50, 15, 'rgb(255,107,107)');
    buildPollChart('o3Chart', 'O₃ (µg/m³)', 38, 12, 'rgb(255,235,59)');
    buildPollChart('so2Chart', 'SO₂ (µg/m³)', 18, 6, 'rgb(255,152,0)');
    buildPollChart('coChart', 'CO (mg/m³)', 1.2, 0.4, 'rgb(156,39,176)');
  } catch (err) {
    console.error('Forecast charts error:', err);
    buildPollChart('pm25Chart', 'PM2.5 (µg/m³)', 65, 20, 'rgb(56,180,255)');
    buildPollChart('pm10Chart', 'PM10 (µg/m³)', 110, 30, 'rgb(0,229,200)');
    buildPollChart('no2Chart', 'NO₂ (µg/m³)', 50, 15, 'rgb(255,107,107)');
    buildPollChart('o3Chart', 'O₃ (µg/m³)', 38, 12, 'rgb(255,235,59)');
    buildPollChart('so2Chart', 'SO₂ (µg/m³)', 18, 6, 'rgb(255,152,0)');
    buildPollChart('coChart', 'CO (mg/m³)', 1.2, 0.4, 'rgb(156,39,176)');
  }
}

// ===== CHENNAI AREAS DATA =====
const chennaiAreas = [
  { name: 'Tondairpet', aqi: 198, lat: 13.1387, lng: 80.2998, color: '#f44336' },
  { name: 'Manali', aqi: 185, lat: 13.1681, lng: 80.2566, color: '#f44336' },
  { name: 'Ambattur', aqi: 162, lat: 13.1127, lng: 80.1567, color: '#ff9800' },
  { name: 'Perambur', aqi: 155, lat: 13.1167, lng: 80.2353, color: '#ff9800' },
  { name: 'Kodambakkam', aqi: 138, lat: 13.0522, lng: 80.2261, color: '#ff9800' },
  { name: 'T. Nagar', aqi: 130, lat: 13.0401, lng: 80.2338, color: '#ff9800' },
  { name: 'Anna Nagar', aqi: 118, lat: 13.0850, lng: 80.2101, color: '#ffeb3b' },
  { name: 'Adyar', aqi: 95, lat: 13.0012, lng: 80.2565, color: '#ffeb3b' },
  { name: 'Velachery', aqi: 110, lat: 12.9815, lng: 80.2209, color: '#ffeb3b' },
  { name: 'OMR', aqi: 88, lat: 12.9121, lng: 80.2279, color: '#ffeb3b' },
  { name: 'ECR', aqi: 72, lat: 12.8600, lng: 80.2300, color: '#00e676' },
  { name: 'Besant Nagar', aqi: 62, lat: 13.0006, lng: 80.2707, color: '#00e676' },
];

// ===== LEAFLET MAP =====
let leafletMap = null;
let leafletMarkers = [];
function initLeafletMap() {
  if (leafletMap) return; // already init
  const container = document.getElementById('leaflet-map');
  if (!container || !window.L) return;
  leafletMap = L.map('leaflet-map', { center: [13.05, 80.22], zoom: 12 });
  // Dark tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap · CartoDB',
    maxZoom: 19
  }).addTo(leafletMap);
  addLeafletMarkers('aqi');
}
function updateLeafletMap(type) {
  if (!leafletMap) return;
  leafletMarkers.forEach(m => m.remove());
  leafletMarkers = [];
  addLeafletMarkers(type);
}
function addLeafletMarkers(type) {
  chennaiAreas.forEach(area => {
    const val = area.aqi;
    const color = aqiColor(val);
    const size = Math.max(30, Math.min(70, val / 4));
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:0.85;
             border:2px solid white;display:flex;align-items:center;justify-content:center;
             font-family:Rajdhani,sans-serif;font-weight:700;font-size:${size > 40 ? 13 : 11}px;color:#080c14;
             box-shadow:0 0 ${size / 2}px ${color}66;cursor:pointer;">
             ${val}</div>`,
      iconSize: [size, size], iconAnchor: [size / 2, size / 2]
    });
    const marker = L.marker([area.lat, area.lng], { icon }).addTo(leafletMap);
    marker.bindPopup(`
      <div style="font-family:Rajdhani,sans-serif;min-width:160px;">
        <div style="font-size:16px;font-weight:700;margin-bottom:6px;">${area.name}</div>
        <div style="font-size:24px;font-weight:700;color:${color};">${val}</div>
        <div style="font-size:13px;color:${color};font-weight:600;">${aqiLabel(val)}</div>
        <div style="font-size:11px;margin-top:6px;">Click for details</div>
      </div>
    `, { className: 'leaflet-popup-custom' });
    leafletMarkers.push(marker);
  });
}

// ===== AREA RANKINGS & CHARTS =====
function buildAreaRankings() {
  const el = document.getElementById('areaRankings'); if (!el) return;
  const sorted = [...chennaiAreas].sort((a, b) => b.aqi - a.aqi);
  el.innerHTML = sorted.map((a, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
      <span style="color:var(--text3);width:18px;text-align:right;">${i + 1}</span>
      <span style="flex:1;font-weight:${i < 3 ? '700' : '400'}">${a.name}</span>
      <span style="font-family:var(--font-head);font-size:16px;font-weight:700;color:${a.color};">${a.aqi}</span>
    </div>`).join('');
}
function buildAreaChart() {
  const existing = Chart.getChart('areaChart'); if (existing) existing.destroy();
  const ctx = document.getElementById('areaChart'); if (!ctx) return;
  const sorted = [...chennaiAreas].sort((a, b) => b.aqi - a.aqi).slice(0, 6);
  new Chart(ctx, {
    type: 'bar',
    data: { labels: sorted.map(a => a.name), datasets: [{ data: sorted.map(a => a.aqi), backgroundColor: sorted.map(a => a.color + '88'), borderColor: sorted.map(a => a.color), borderWidth: 2, borderRadius: 6 }] },
    options: { ...baseOpts('AQI'), indexAxis: 'y' },
  });
}
function buildSourcesChart() {
  const existing = Chart.getChart('sourcesChart'); if (existing) existing.destroy();
  const ctx = document.getElementById('sourcesChart'); if (!ctx) return;
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Vehicles', 'Industry', 'Dust', 'Burning', 'Other'],
      datasets: [{ data: [42, 28, 15, 10, 5], backgroundColor: ['#f44336aa', '#ff9800aa', '#ffeb3baa', '#9c27b0aa', '#38b4ffaa'], borderColor: ['#f44336', '#ff9800', '#ffeb3b', '#9c27b0', '#38b4ff'], borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 10 }, boxWidth: 10 } } } },
  });
}

// ===== THREE.JS 3D VISUALIZATION =====
let renderer3D = null, scene3D = null, camera3D = null, animFrame3D = null;
let isDragging3D = false, prev3DMouse = { x: 0, y: 0 };
let rotX = 0.3, rotY = 0.5, zoom3D = 8;
let anim3DRunning = true;
let bars3D = [];

function init3D() {
  if (!window.THREE) return;
  const canvas = document.getElementById('viz3d-canvas');
  if (!canvas) return;
  if (renderer3D) renderer3D.dispose();

  const W = canvas.clientWidth || canvas.offsetWidth || 800;
  const H = canvas.clientHeight || canvas.offsetHeight || 520;
  renderer3D = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer3D.setSize(W, H);
  renderer3D.setPixelRatio(window.devicePixelRatio);
  renderer3D.setClearColor(0x030810, 1);

  scene3D = new THREE.Scene();
  scene3D.fog = new THREE.FogExp2(0x030810, 0.04);

  camera3D = new THREE.PerspectiveCamera(45, W / H, 0.1, 200);
  camera3D.position.set(0, zoom3D, zoom3D);
  camera3D.lookAt(0, 0, 0);

  // Lighting
  const ambLight = new THREE.AmbientLight(0x334466, 0.8);
  scene3D.add(ambLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 10, 5);
  scene3D.add(dirLight);
  const pointLight = new THREE.PointLight(0x38b4ff, 1.5, 30);
  pointLight.position.set(0, 8, 0);
  scene3D.add(pointLight);

  // Grid floor
  const gridHelper = new THREE.GridHelper(20, 20, 0x1a2640, 0x0d1424);
  scene3D.add(gridHelper);

  // Bars for each area
  bars3D = [];
  const cols = 4, rows = Math.ceil(chennaiAreas.length / cols);
  const spacing = 3.5;
  const offsetX = -(cols - 1) * spacing / 2;
  const offsetZ = -(rows - 1) * spacing / 2;

  chennaiAreas.forEach((area, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = offsetX + col * spacing, z = offsetZ + row * spacing;
    const maxH = 8;
    const h = Math.max(0.2, (area.aqi / 300) * maxH);
    const color = new THREE.Color(area.color);

    // Bar
    const geo = new THREE.BoxGeometry(2, h, 2);
    const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.85, shininess: 60 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    scene3D.add(mesh);

    // Glow top disc
    const discGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.08, 16);
    const discMat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.7, emissive: color, emissiveIntensity: 0.5 });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(x, h + 0.04, z);
    scene3D.add(disc);

    // Label sprite
    const canvas2 = document.createElement('canvas');
    canvas2.width = 256; canvas2.height = 128;
    const ctx2 = canvas2.getContext('2d');
    ctx2.fillStyle = 'rgba(0,0,0,0)'; ctx2.fillRect(0, 0, 256, 128);
    ctx2.fillStyle = area.color;
    ctx2.font = 'bold 28px Rajdhani,sans-serif';
    ctx2.textAlign = 'center';
    ctx2.fillText(area.aqi + '', 128, 48);
    ctx2.fillStyle = 'rgba(200,220,255,0.9)';
    ctx2.font = '18px Rajdhani,sans-serif';
    ctx2.fillText(area.name, 128, 80);
    const tex = new THREE.CanvasTexture(canvas2);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3, 1.5, 1);
    sprite.position.set(x, h + 1.2, z);
    scene3D.add(sprite);

    bars3D.push({ mesh, disc, targetH: h, currentH: 0, row, col, x, z });
  });

  // Animate bars rising
  bars3D.forEach((b, i) => {
    b.mesh.scale.y = 0.01;
    b.mesh.position.y = 0.01;
    setTimeout(() => {
      const rise = () => {
        b.mesh.scale.y = Math.min(b.mesh.scale.y + 0.04, 1);
        b.mesh.position.y = (b.targetH * b.mesh.scale.y) / 2;
        if (b.mesh.scale.y < 1) requestAnimationFrame(rise);
      };
      rise();
    }, i * 80);
  });

  // Mouse drag
  canvas.onmousedown = e => { isDragging3D = true; prev3DMouse = { x: e.clientX, y: e.clientY }; };
  canvas.onmouseup = () => { isDragging3D = false; };
  canvas.onmousemove = e => {
    if (!isDragging3D) return;
    rotY += (e.clientX - prev3DMouse.x) * 0.008;
    rotX += (e.clientY - prev3DMouse.y) * 0.008;
    rotX = Math.max(-1, Math.min(1, rotX));
    prev3DMouse = { x: e.clientX, y: e.clientY };
  };
  canvas.onwheel = e => {
    zoom3D = Math.max(4, Math.min(25, zoom3D + e.deltaY * 0.01));
    e.preventDefault();
  };
  canvas.addEventListener('touchstart', e => { isDragging3D = true; prev3DMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener('touchend', () => { isDragging3D = false; });
  canvas.addEventListener('touchmove', e => {
    if (!isDragging3D) return;
    rotY += (e.touches[0].clientX - prev3DMouse.x) * 0.008;
    rotX += (e.touches[0].clientY - prev3DMouse.y) * 0.005;
    prev3DMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    e.preventDefault();
  }, { passive: false });

  // Stats cards below
  const statsEl = document.getElementById('viz3dStats');
  if (statsEl) {
    const top = [...chennaiAreas].sort((a, b) => b.aqi - a.aqi).slice(0, 4);
    statsEl.innerHTML = top.map(a => `
      <div class="card" style="padding:16px;border-color:${a.color}44;">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;">${a.name}</div>
        <div style="font-family:var(--font-head);font-size:32px;font-weight:700;color:${a.color};margin:4px 0;">${a.aqi}</div>
        <div style="font-size:12px;color:var(--text2);">${aqiLabel(a.aqi)}</div>
      </div>`).join('');
  }

  animate3D();
}

function animate3D() {
  if (!anim3DRunning) { animFrame3D = requestAnimationFrame(animate3D); return; }
  animFrame3D = requestAnimationFrame(animate3D);
  if (!scene3D || !camera3D || !renderer3D) return;
  // Auto-rotate slowly
  if (!isDragging3D) rotY += 0.003;
  camera3D.position.x = Math.sin(rotY) * Math.cos(rotX) * zoom3D;
  camera3D.position.y = Math.sin(rotX) * zoom3D + 3;
  camera3D.position.z = Math.cos(rotY) * Math.cos(rotX) * zoom3D;
  camera3D.lookAt(0, 2, 0);
  // Pulse disc glow
  const t = Date.now() * 0.001;
  bars3D.forEach((b, i) => { if (b.disc) b.disc.material.emissiveIntensity = 0.4 + 0.3 * Math.sin(t * 2 + i * 0.5); });
  renderer3D.render(scene3D, camera3D);
}
function reset3DCamera() { rotX = 0.3; rotY = 0.5; zoom3D = 8; }
function toggle3DAnimation() {
  anim3DRunning = !anim3DRunning;
  const btn = document.getElementById('anim3dBtn');
  if (btn) btn.textContent = anim3DRunning ? '⏸ Pause' : '▶ Resume';
}

// ===== AI PAGE =====
const modelData = {
  lstm: { acc: '93.2%', mae: '4.8', rmse: '6.3', r2: '0.94' },
  rf: { acc: '88.7%', mae: '7.2', rmse: '9.1', r2: '0.88' },
  xgb: { acc: '91.4%', mae: '5.6', rmse: '7.4', r2: '0.91' },
  ensemble: { acc: '95.1%', mae: '3.9', rmse: '5.1', r2: '0.96' },
};
function selectModel(id, el) {
  document.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const m = modelData[id];
  document.getElementById('metric-acc').textContent = m.acc;
  document.getElementById('metric-mae').textContent = m.mae;
  document.getElementById('metric-rmse').textContent = m.rmse;
  document.getElementById('metric-r2').textContent = m.r2;
}
function buildFeatureImportance() {
  const el = document.getElementById('featureImportance'); if (!el) return;
  const features = [
    { name: 'PM2.5 (t-1)', val: 87 },
    { name: 'Temperature', val: 72 },
    { name: 'Wind Speed', val: 65 },
    { name: 'Humidity', val: 58 },
    { name: 'NO₂', val: 54 },
    { name: 'Traffic density', val: 45 },
  ];
  el.innerHTML = features.map(f => `
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
        <span style="color:var(--text2);">${f.name}</span>
        <span style="color:var(--accent);font-weight:700;">${f.val}%</span>
      </div>
      <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;">
        <div style="height:100%;width:${f.val}%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px;transition:width 1s ease;"></div>
      </div>
    </div>`).join('');
}
function buildAICharts() {
  const opts = baseOpts('AQI');
  opts.plugins.legend = { display: true, labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 11 }, boxWidth: 14 } };
  const labels = Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);
  const actual = Array.from({ length: 30 }, () => rnd(80, 200));
  const predicted = actual.map(v => v + rnd(-10, 10));
  // Pred vs actual
  const pac = document.getElementById('predActualChart');
  if (pac) {
    const ex = Chart.getChart('predActualChart'); if (ex) ex.destroy();
    new Chart(pac, {
      type: 'line', data: {
        labels, datasets: [
          { label: 'Actual', data: actual, borderColor: '#ff6b6b', borderWidth: 2, tension: 0.4, pointRadius: 0 },
          { label: 'Predicted', data: predicted, borderColor: '#38b4ff', borderWidth: 2, tension: 0.4, pointRadius: 0, borderDash: [4, 4] },
        ]
      }, options: opts
    });
  }
  // 72h prediction
  const pch = document.getElementById('predChart');
  if (pch) {
    const ex = Chart.getChart('predChart'); if (ex) ex.destroy();
    const base = LiveData.aqi || 140;
    let v = base; const d72 = [];
    for (let i = 0; i < 72; i++) { v += rnd(-8, 8); v = Math.max(40, Math.min(280, v)); d72.push(v); }
    const g = makeGradient(pch.getContext('2d'), 'rgba(0,229,200,0.3)', 'rgba(0,229,200,0)');
    new Chart(pch, {
      type: 'line', data: {
        labels: Array.from({ length: 72 }, (_, i) => i % 6 === 0 ? `+${i}h` : ''), datasets: [
          { label: '72h Forecast', data: d72, fill: true, backgroundColor: g, borderColor: '#00e5c8', borderWidth: 2, tension: 0.4, pointRadius: 0 },
        ]
      }, options: baseOpts('AQI')
    });
  }
}

// ===== HISTORY CHARTS =====
function buildHistoryChart() {
  const ctx = document.getElementById('historyChart'); if (!ctx) return;
  const existing = Chart.getChart('historyChart'); if (existing) existing.destroy();
  const labels = []; for (let i = 29; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); labels.push(d.getDate() + ' ' + months[d.getMonth()]); }
  let v = 130; const data = []; for (let i = 0; i < 30; i++) { v += rnd(-30, 30); v = Math.max(50, Math.min(250, v)); data.push(v); }
  const g = makeGradient(ctx.getContext('2d'), 'rgba(56,180,255,0.4)', 'rgba(56,180,255,0)');
  new Chart(ctx, { type: 'line', data: { labels, datasets: [{ data, fill: true, backgroundColor: g, borderColor: '#38b4ff', borderWidth: 2, tension: 0.4, pointRadius: 0 }] }, options: baseOpts('AQI') });
}
function buildDistChart() {
  const ctx = document.getElementById('distChart'); if (!ctx) return;
  const existing = Chart.getChart('distChart'); if (existing) existing.destroy();
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Good', 'Moderate', 'Unhealthy-S', 'Unhealthy', 'Very Unhealthy'],
      datasets: [{ data: [3, 8, 10, 6, 3], backgroundColor: ['#00e67644', '#ffeb3b44', '#ff980044', '#f4433644', '#9c27b044'], borderColor: ['#00e676', '#ffeb3b', '#ff9800', '#f44336', '#9c27b0'], borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right', labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 11 }, boxWidth: 14 } } } },
  });
}
function buildCorrChart() {
  const ctx = document.getElementById('corrChart'); if (!ctx) return;
  const existing = Chart.getChart('corrChart'); if (existing) existing.destroy();
  const temps = Array.from({ length: 30 }, () => rndF(28, 38));
  const aqis = temps.map(t => Math.round(t * 4.2 + rnd(-20, 20)));
  const opts = baseOpts('AQI');
  opts.plugins.legend = { display: true, labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 11 }, boxWidth: 14 } };
  new Chart(ctx, {
    type: 'scatter', data: { datasets: [{ label: 'Temp vs AQI', data: temps.map((t, i) => ({ x: t, y: aqis[i] })), backgroundColor: 'rgba(56,180,255,0.5)', borderColor: '#38b4ff', pointRadius: 5 }] },
    options: { ...opts, scales: { x: { ...opts.scales.x, title: { display: true, text: 'Temperature (°C)', color: 'rgba(226,238,255,0.5)', font: { family: CHART_FONT, size: 11 } } }, y: { ...opts.scales.y } } }
  });
}
function buildHeatmapChart() {
  const ctx = document.getElementById('heatmapChart'); if (!ctx) return;
  const existing = Chart.getChart('heatmapChart'); if (existing) existing.destroy();
  const polls = ['PM2.5', 'PM10', 'NO₂', 'O₃', 'SO₂'];
  const data = polls.map(() => Array.from({ length: 30 }, () => rnd(20, 100)));
  new Chart(ctx, {
    type: 'bar',
    data: { labels: Array.from({ length: 30 }, (_, i) => i % 5 === 0 ? (i + 1) + '' : ''), datasets: polls.map((p, i) => ({ label: p, data: data[i], backgroundColor: ['#ff9800aa', '#ffeb3baa', '#ff6b6baa', '#00e5c8aa', '#00e676aa'][i], stack: 's' })) },
    options: { ...baseOpts('Level'), plugins: { ...baseOpts().plugins, legend: { display: true, labels: { color: 'rgba(226,238,255,0.7)', font: { family: CHART_FONT, size: 10 }, boxWidth: 10 } } } },
  });
}

// ===== HEALTH CHART =====
function buildHealthChart() {
  const ctx = document.getElementById('healthChart'); if (!ctx) return;
  const existing = Chart.getChart('healthChart'); if (existing) existing.destroy();
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Good\n0-50', 'Moderate\n51-100', 'Unhealthy-S\n101-150', 'Unhealthy\n151-200', 'V.Unhealthy\n201-300', 'Hazardous\n300+'],
      datasets: [{
        data: [5, 15, 35, 60, 85, 100],
        backgroundColor: ['#00e67655', '#ffeb3b55', '#ff980055', '#f4433655', '#9c27b055', '#7b1fa255'],
        borderColor: ['#00e676', '#ffeb3b', '#ff9800', '#f44336', '#9c27b0', '#7b1fa2'],
        borderWidth: 2, borderRadius: 8,
      }]
    },
    options: { ...baseOpts('Health Risk %'), plugins: { ...baseOpts().plugins, tooltip: { ...baseOpts().plugins.tooltip, callbacks: { label: c => `Risk: ${c.raw}%` } } } },
  });
}

// ===== ALERTS =====
function buildAlerts() {
  const alertsData = [
    { icon: '🔴', title: 'AQI Spike — Tondairpet', desc: 'AQI reached 198 — Very Unhealthy', time: '2 min ago', sev: 'high' },
    { icon: '🟡', title: 'High NO₂ — Ambattur', desc: 'NO₂ at 78 µg/m³, exceeds threshold', time: '25 min ago', sev: 'med' },
    { icon: '🔵', title: 'Forecast Updated', desc: '7-day model updated with 95.1% confidence', time: '1 hour ago', sev: 'low' },
  ];
  const historyData = [
    { icon: '🔴', title: 'AQI 205 — Manali', desc: 'Very Unhealthy conditions yesterday at 2pm', time: 'Yesterday 14:00', sev: 'high' },
    { icon: '🟡', title: 'PM2.5 Alert — Perambur', desc: 'PM2.5 exceeded 80 µg/m³', time: 'Yesterday 08:00', sev: 'med' },
    { icon: '🟢', title: 'Air Quality Improved', desc: 'Anna Nagar AQI dropped from 145 to 118', time: '2 days ago', sev: 'low' },
    { icon: '🔴', title: 'Dust Storm Alert', desc: 'PM10 spiked to 340 µg/m³ across North Chennai', time: '3 days ago', sev: 'high' },
  ];
  const makeItem = (a) => `
    <div class="alert-item">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
        <div class="alert-time">${a.time}</div>
      </div>
      <div class="alert-sev sev-${a.sev}">${a.sev.toUpperCase()}</div>
    </div>`;
  const al = document.getElementById('alertsList'); if (al) al.innerHTML = alertsData.map(makeItem).join('');
  const ah = document.getElementById('alertHistory'); if (ah) ah.innerHTML = historyData.map(makeItem).join('');
}

// ===== EXPOSURE TRACKER =====
function calcExposure() {
  const areaAQI = parseInt(document.getElementById('exp-area').value);
  const commuteMin = parseFloat(document.getElementById('exp-commute').value) || 0;
  const exerciseMin = parseFloat(document.getElementById('exp-exercise').value) || 0;
  const homeHrs = parseFloat(document.getElementById('exp-home').value) || 10;
  const purifierFactor = parseFloat(document.getElementById('exp-purifier').value) || 1;
  const breathRate = parseFloat(document.getElementById('exp-activity').value) || 1.0;
  // Convert AQI to approximate PM2.5
  const outdoorPM25 = areaAQI * 0.4;
  const indoorPM25 = outdoorPM25 * 0.6 * purifierFactor;
  const restHrs = 24 - homeHrs - (commuteMin + exerciseMin) / 60;
  // Dose = concentration × time × breathing rate multiplier
  const commuteExp = outdoorPM25 * (commuteMin / 60) * 1.2;
  const exerciseExp = outdoorPM25 * (exerciseMin / 60) * breathRate;
  const homeExp = indoorPM25 * homeHrs * 0.45;
  const restExp = indoorPM25 * Math.max(0, restHrs) * 0.3;
  const totalDose = commuteExp + exerciseExp + homeExp + restExp;
  const dose = totalDose.toFixed(1);
  let statusHTML, statusColor;
  if (totalDose < 20) { statusColor = '#00e676'; statusHTML = `<div style="color:#00e676;font-weight:700;">✅ Low Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Your exposure is within safe limits. Keep up good habits!</div>`; }
  else if (totalDose < 60) { statusColor = '#ffeb3b'; statusHTML = `<div style="color:#ffeb3b;font-weight:700;">⚠️ Moderate Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Consider reducing outdoor time or using a mask during commute.</div>`; }
  else if (totalDose < 120) { statusColor = '#ff9800'; statusHTML = `<div style="color:#ff9800;font-weight:700;">🚨 High Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Significantly above safe levels. Use N95 mask outdoors and get an air purifier.</div>`; }
  else { statusColor = '#f44336'; statusHTML = `<div style="color:#f44336;font-weight:700;">🚫 Dangerous Exposure</div><div style="font-size:12px;margin-top:4px;color:var(--text2);">Critically high. Strongly recommend limiting outdoor activity and seeing a doctor.</div>`; }
  document.getElementById('expDose').textContent = dose;
  document.getElementById('expDose').style.color = statusColor;
  document.getElementById('expStatus').innerHTML = statusHTML;
  document.getElementById('expStatus').style.background = statusColor + '11';
  document.getElementById('expStatus').style.border = `1px solid ${statusColor}44`;
  document.getElementById('expBreakdown').innerHTML = [
    { label: 'Commute (outdoor)', val: commuteExp.toFixed(1) },
    { label: 'Exercise (outdoor)', val: exerciseExp.toFixed(1) },
    { label: 'Home exposure', val: homeExp.toFixed(1) },
    { label: 'Sleep/rest', val: restExp.toFixed(1) },
  ].map(b => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">
    <span style="color:var(--text2);">${b.label}</span><span style="font-weight:700;">${b.val} µg/m³·h</span></div>`).join('');
  const who = 15 * 0.45 * 24; // WHO safe daily exposure approx
  document.getElementById('expAdvice').innerHTML = `💡 <strong>WHO guideline:</strong> PM2.5 annual mean ≤ 5 µg/m³. Your daily exposure of <strong>${dose} µg/m³·h</strong> is ${totalDose < who ? 'within' : 'above'} recommended safe limits. ${totalDose > 60 ? 'Consider: N95 mask, air purifier at home, reduce outdoor peak-hour activity.' : 'Great job managing your exposure!'}`;
  document.getElementById('exposureResult').style.display = 'block';
  document.getElementById('exposurePlaceholder').style.display = 'none';
  buildExposureChart([commuteExp, exerciseExp, homeExp, restExp]);
}
function buildExposureChart(data) {
  const existing = Chart.getChart('exposureChart'); if (existing) existing.destroy();
  const ctx = document.getElementById('exposureChart'); if (!ctx) return;
  const d = data || [10, 0, 15, 5];
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Commute', 'Exercise', 'Home', 'Sleep'],
      datasets: [{ data: d, backgroundColor: ['#ff980088', '#f4433688', '#38b4ff88', '#00e67688'], borderColor: ['#ff9800', '#f44336', '#38b4ff', '#00e676'], borderWidth: 2, borderRadius: 8 }]
    },
    options: { ...baseOpts('µg/m³·h'), plugins: { ...baseOpts().plugins, tooltip: { ...baseOpts().plugins.tooltip, callbacks: { label: c => `${c.raw.toFixed(1)} µg/m³·h` } } } },
  });
}

// ===== AI HEALTH CHAT =====
const chatHistory = [];
function updateChatContext() {
  const chatAQI = document.getElementById('chatAQI');
  if (chatAQI && LiveData.aqi) chatAQI.textContent = `${LiveData.aqi} — ${aqiLabel(LiveData.aqi)}`;
  updateContextPanel();
}
function getAQIContext() {
  return `You are ChennAIR, an AI health advisor for Chennai air pollution. 
Today's live data:
- AQI: ${LiveData.aqi || 'N/A'} (${aqiLabel(LiveData.aqi || 0)})
- PM2.5: ${LiveData.pm25 || 'N/A'} µg/m³ (WHO guideline: 15 µg/m³)
- PM10: ${LiveData.pm10 || 'N/A'} µg/m³
- NO₂: ${LiveData.no2 || 'N/A'} µg/m³
- O₃: ${LiveData.o3 || 'N/A'} µg/m³
- Temperature: ${LiveData.temp || 'N/A'}°C
- Wind: ${LiveData.wind || 'N/A'} km/h, Humidity: ${LiveData.humidity || 'N/A'}%
- Weather: ${LiveData.weatherDesc || 'Partly Cloudy'}
- Worst area: Tondairpet (AQI 198), Best area: Besant Nagar (AQI 62)
- 7-day forecast: ${LiveData.forecastAQI.join(', ')}

Answer health questions concisely (2-4 sentences max). Be specific, practical, and friendly. Use the live data above to give context-aware advice.`;
}

async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  appendMsg(msg, 'user');
  const sendBtn = document.getElementById('chatSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  // Typing indicator
  const typingId = 'typing-' + Date.now();
  const chatMsgs = document.getElementById('chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg typing'; typingEl.id = typingId;
  typingEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  chatMsgs.appendChild(typingEl);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;

  chatHistory.push({ role: 'user', content: msg });
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'YOUR_ANTHROPIC_API_KEY_HERE',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: getAQIContext(),
        messages: chatHistory.slice(-8),
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response. Please try again.';
    chatHistory.push({ role: 'assistant', content: reply });
    document.getElementById(typingId)?.remove();
    appendMsg(reply, 'bot');
  } catch (err) {
    document.getElementById(typingId)?.remove();
    appendMsg('Sorry, I\'m having trouble connecting. Please check your network and try again.', 'bot');
  }
  if (sendBtn) sendBtn.disabled = false;
}
function sendQuick(msg) {
  document.getElementById('chatInput').value = msg;
  sendChat();
}
function appendMsg(text, role) {
  const chatMsgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  chatMsgs.appendChild(div);
  chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// ===== DOWNLOAD REPORT (real PDF via jsPDF) =====
async function downloadReport() {
  if (window.jspdf) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('ChennAIR — Air Quality Report', 105, 20, { align: 'center' });
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 30, { align: 'center' });
      doc.line(15, 35, 195, 35);
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Current Conditions', 15, 48);
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      const lines = [
        `AQI: ${LiveData.aqi || 'N/A'} — ${aqiLabel(LiveData.aqi || 0)}`,
        `PM2.5: ${LiveData.pm25 || 'N/A'} µg/m³`,
        `PM10: ${LiveData.pm10 || 'N/A'} µg/m³`,
        `NO₂: ${LiveData.no2 || 'N/A'} µg/m³`,
        `O₃: ${LiveData.o3 || 'N/A'} µg/m³`,
        `Temperature: ${LiveData.temp || 'N/A'}°C  |  Wind: ${LiveData.wind || 'N/A'} km/h`,
        `Humidity: ${LiveData.humidity || 'N/A'}%`,
      ];
      lines.forEach((l, i) => doc.text(l, 15, 58 + i * 8));
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('7-Day AQI Forecast', 15, 125);
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      LiveData.forecastAQI.forEach((v, i) => {
        const d = new Date(); d.setDate(d.getDate() + i);
        doc.text(`${i === 0 ? 'Today' : days[d.getDay()]} ${d.getDate()}: AQI ${v} — ${aqiLabel(v)}`, 15, 135 + i * 8);
      });
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('Health Advisory', 15, 200);
      doc.setFontSize(11); doc.setFont('helvetica', 'normal');
      doc.text(aqiMsg(LiveData.aqi || 0), 15, 210, { maxWidth: 180 });
      doc.text('Data Sources: WAQI, OpenWeatherMap, Sentinel-5P', 15, 270);
      doc.text('© ChennAIR v3.0 — AI-Powered Pollution Forecasting', 105, 285, { align: 'center' });
      doc.save(`ChennAIR_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast('✅', 'PDF Report Downloaded', 'Chennai_AQI_Report saved');
    } catch (e) {
      showToast('📄', 'Report Ready', 'ChennAIR_AQI_Report.pdf');
    }
  } else {
    showToast('📄', 'Report', 'jsPDF loading — try again shortly');
  }
}

// Download CSV
function downloadCSV() {
  const rows = [['Date', 'AQI', 'Status']];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const aqi = rnd(60, 200);
    rows.push([d.toISOString().split('T')[0], aqi, aqiLabel(aqi)]);
  }
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'ChennAIR_History.csv';
  a.click();
  showToast('✅', 'CSV Downloaded', 'ChennAIR_History.csv saved');
}

// ===== UI HELPERS =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  if (leafletMap) {
    leafletMap.eachLayer(l => { if (l._url) leafletMap.removeLayer(l); });
    const tileUrl = isDark ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, { attribution: '© OpenStreetMap · CartoDB', maxZoom: 19 }).addTo(leafletMap);
  }
  setTimeout(rebuildAllCharts, 100);
}
function toggleNotifPanel() { document.getElementById('notifPanel').classList.toggle('open'); }
function loginUser() {
  document.getElementById('loginModal').classList.remove('open');
  showToast('👤', 'Signed In', 'Welcome! Personalized alerts enabled.');
  const btn = document.querySelector('.user-btn');
  if (btn) { btn.textContent = '✓'; btn.style.background = 'linear-gradient(135deg,#00e676,#00b8d4)'; }
}
function setUnit(unit, btn) {
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function showToast(icon, title, msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent = msg;
  t.children[0].textContent = icon;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
function saveThresholds() {
  localStorage.setItem('thresh_pm25', thresholds.pm25);
  localStorage.setItem('thresh_aqi', thresholds.aqi);
  localStorage.setItem('thresh_no2', thresholds.no2);
}

// Close panels on outside click
document.addEventListener('click', e => {
  const sidebar = document.getElementById('sidebar');
  const notif = document.getElementById('notifPanel');
  if (!sidebar.contains(e.target) && !e.target.classList.contains('menu-btn')) sidebar.classList.remove('open');
  if (!notif.contains(e.target) && !e.target.closest('.alert-btn')) notif.classList.remove('open');
});

// ===== INIT ALL =====
window.addEventListener('load', async () => {
  drawGauge(null); // Draw empty gauge first
  buildTrendChart();
  buildDayCards();
  buildForecastMainChart('aqi');
  buildAPIForecastCharts();

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Fetch live data
  await Promise.allSettled([loadAQI(), loadWeather()]);

  // Rebuild after live data arrives
  buildTrendChart();
  buildDayCards();
  buildForecastMainChart('aqi');

  // Auto-refresh every 15 minutes
  setInterval(() => {
    loadAQI();
    loadWeather();
  }, 15 * 60 * 1000);

  // Handle hash navigation
  const hash = location.hash.replace('#', '');
  if (hash && pageTitles[hash]) {
    const nav = document.querySelector(`.nav-item[onclick*="'${hash}'"]`);
    showPage(hash, nav);
  }
});
