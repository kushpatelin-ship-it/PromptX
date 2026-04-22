'use strict';
/**
 * CHILD v13 — Smart agent with:
 * - WiFi reset detection + auto-reconnect
 * - New boss IP auto-discovery on network change
 * - Lifecycle alerts (signoff/logout/shutdown)
 * - Backfill on reconnect
 * - Site scanner callback
 */
const dgram   = require('dgram');
const http    = require('http');
const os      = require('os');
const act     = require('./activity');
const store   = require('./store');
const { log } = require('./logger');
const { getParentIp, saveIp } = require('./role');
const C = require('./constants');

let _parentIp    = null;
let _hbTimer     = null;
let _sampleTimer = null;
let _saveTimer   = null;
let _netTimer    = null;
let _lastState   = null;
let _eodSent     = false;
let _localTl     = [];
let _connecting  = false;
let _failStrikes = 0;   // consecutive POST failures
const MAX_STRIKES = 3; // tolerate transient errors before dropping

// ── Suppress UI ────────────────────────────────────────────────────────────────
function suppressUI() {
  try {
    const { app, BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach(w => { w.hide(); w.setSkipTaskbar(true); });
    app.on('browser-window-created', (_, w) => { w.hide(); w.setSkipTaskbar(true); });
  } catch(_) {}
}

// ── Block employee from boss dashboard ────────────────────────────────────────
function blockBossDashboard(ip) {
  if (process.platform !== 'win32' || !ip) return;
  try {
    const { execSync } = require('child_process');
    // Add firewall rule to block outbound to boss port
    execSync(
      `netsh advfirewall firewall add rule name="PromptAI-BlockBoss" ` +
      `protocol=TCP dir=out remoteip=${ip} remoteport=${C.DASHBOARD_PORT} action=block 2>nul`,
      { timeout: 3000, stdio: 'ignore' }
    );
  } catch(_) {}
}

// ── Network change detection ───────────────────────────────────────────────────
function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const addrs of Object.values(nets)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
    }
  }
  return ips.join(',');
}

let _lastIPs = getLocalIPs();

function startNetworkMonitor() {
  _netTimer = setInterval(() => {
    const currentIPs = getLocalIPs();
    if (currentIPs !== _lastIPs) {
      log('NET', `Network changed: ${_lastIPs} → ${currentIPs}`);
      _lastIPs = currentIPs;
      // Network changed — rediscover boss
      if (_parentIp && !_connecting) {
        log('NET', 'Pinging boss to verify connection...');
        ping(_parentIp, ok => {
          if (!ok) {
            log('NET', 'Boss unreachable after network change — rediscovering');
            loseConnection();
          } else {
            log('NET', 'Boss still reachable on same IP');
          }
        });
      } else if (!_parentIp && !_connecting) {
        log('NET', 'No boss IP — starting discovery');
        reconnect();
      }
    }
  }, 60_000); // check every 60 seconds — reduce false network-change positives
}

function ping(ip, cb) {
  const req = http.request(
    { hostname: ip, port: C.DASHBOARD_PORT, path: '/api/ping', timeout: 3000 },
    res => { res.resume(); cb(true); }
  );
  req.on('error', () => cb(false));
  req.on('timeout', () => { req.destroy(); cb(false); });
  req.end();
}

function loseConnection() {
  if (!_parentIp && !_hbTimer) return; // already disconnected
  clearInterval(_hbTimer);
  clearInterval(_sampleTimer);
  clearInterval(_saveTimer);
  _hbTimer = null; _sampleTimer = null; _saveTimer = null;
  _parentIp = null;
  _connecting = false; // reset so reconnect can proceed
  log('CHILD', 'Connection lost — rediscovering in 5s');
  setTimeout(reconnect, 5000);
}

function reconnect() {
  if (_connecting) return;
  _connecting = true;
  // First try saved IP
  const savedIp = getParentIp();
  if (savedIp) {
    ping(savedIp, ok => {
      if (ok) {
        _connecting = false;
        log('CHILD', `Saved IP ${savedIp} still valid`);
        handshakeAndBackfill(savedIp, () => startReporting(savedIp));
      } else {
        log('CHILD', `Saved IP ${savedIp} unreachable — broadcasting`);
        discover(ip => {
          _connecting = false;
          saveIp(ip);
          handshakeAndBackfill(ip, () => startReporting(ip));
        });
      }
    });
  } else {
    discover(ip => {
      _connecting = false;
      saveIp(ip);
      handshakeAndBackfill(ip, () => startReporting(ip));
    });
  }
}

// ── Discovery ──────────────────────────────────────────────────────────────────
function discover(onFound) {
  let found = false;
  let attempts = 0;
  function attempt() {
    if (found) return;
    attempts++;
    log('DISC', `Broadcast attempt ${attempts}`);
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', e => {
      log('DISC', e.message);
      try { sock.close(); } catch(_) {}
      if (!found) setTimeout(attempt, C.DISCOVER_MS);
    });
    sock.bind(0, () => {
      try { sock.setBroadcast(true); } catch(_) {}
      sock.send(Buffer.from(C.DISCOVERY_MSG), C.DISCOVERY_PORT, '255.255.255.255');
      const t = setTimeout(() => {
        try { sock.close(); } catch(_) {}
        if (!found) setTimeout(attempt, C.DISCOVER_MS);
      }, C.DISCOVER_WAIT_MS);
      sock.on('message', (msg, r) => {
        if (msg.toString().trim() === C.DISCOVERY_ACK && !found) {
          found = true;
          clearTimeout(t);
          try { sock.close(); } catch(_) {}
          log('DISC', `Found boss at ${r.address}`);
          onFound(r.address);
        }
      });
    });
  }
  attempt();
}

// ── Backfill handshake ─────────────────────────────────────────────────────────
function handshakeAndBackfill(parentIp, cb) {
  const req = http.request({
    hostname: parentIp, port: C.DASHBOARD_PORT,
    path: '/api/last-seen?host=' + encodeURIComponent(os.hostname()),
    timeout: 5000,
  }, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try {
        const { lastSeen } = JSON.parse(body);
        if (lastSeen) {
          const missed = store.getTimelineSince(lastSeen);
          if (missed.length > 0) {
            log('CHILD', `Backfilling ${missed.length} missed windows`);
            post(parentIp, JSON.stringify({
              type: 'backfill', hostname: os.hostname(),
              ts: new Date().toISOString(), windows: missed, count: missed.length,
            }), 'backfill');
          }
        }
      } catch(_) {}
      cb();
    });
  });
  req.on('error', () => cb());
  req.on('timeout', () => { req.destroy(); cb(); });
  req.end();
}

// ── Site blocked callback ──────────────────────────────────────────────────────
function onBlockedSite(info) {
  if (!_parentIp) return;
  const payload = JSON.stringify({
    type: 'site_alert', hostname: os.hostname(),
    ts: new Date().toISOString(), state: _lastState || 'active',
    alerts: [{
      type: 'blocked_site', category: info.category,
      site: info.url, keyword: info.keyword, title: info.title,
      message: `Inappropriate site visited: "${info.title}" [${info.category}]`,
      severity: 'critical', ts: info.ts,
    }],
  });
  post(_parentIp, payload, 'site_alert');
  log('BLOCKED', `Alert sent: ${info.category} — ${info.url}`);
}

// ── Lifecycle alert ────────────────────────────────────────────────────────────
function sendLifecycleAlert(reason) {
  store.saveTimeline(_localTl);
  if (!_parentIp) return;
  const now = new Date();
  const s = new Date(now); s.setHours(C.SHIFT_START_H || 8, 0, 0, 0);
  const e = new Date(now); e.setHours(C.SHIFT_END_H || 20, 0, 0, 0);
  const payload = JSON.stringify({
    type: 'lifecycle', hostname: os.hostname(),
    ts: new Date().toISOString(), event: reason, state: 'offline',
    alerts: [{ type: reason, message: `${os.hostname()} ${reason} at ${now.toLocaleTimeString()}`, severity: 'info', ts: now.toISOString() }],
    summary: act.daySummary(s.toISOString(), e.toISOString()),
  });
  try {
    const { execSync } = require('child_process');
    execSync(
      `node -e "const h=require('http'),d=Buffer.from(${JSON.stringify(payload)});` +
      `const r=h.request({hostname:'${_parentIp}',port:${C.DASHBOARD_PORT},` +
      `path:'/api/child-report',method:'POST',timeout:3000,` +
      `headers:{'Content-Type':'application/json','Content-Length':d.length}},res=>res.resume());` +
      `r.write(d);r.end();"`,
      { timeout: 4000, stdio: 'ignore' }
    );
    log('CHILD', 'Lifecycle alert sent: ' + reason);
  } catch(_) {}
}

// ── Payload builder ────────────────────────────────────────────────────────────
function buildPayload(type) {
  const snap = act.snapshot();
  _localTl.push(snap);
  if (_localTl.length > C.MAX_TL) _localTl.shift();
  const now = new Date();
  const s = new Date(now); s.setHours(C.SHIFT_START_H || 8, 0, 0, 0);
  const e = new Date(now); e.setHours(C.SHIFT_END_H || 20, 0, 0, 0);
  return {
    type, hostname: os.hostname(), platform: process.platform,
    ts: new Date().toISOString(),
    state: snap.state, idle_s: snap.idle_s, active_win: snap.active_win,
    screen_locked: snap.screen_locked, processes: snap.processes,
    login_time: snap.login_time, spoof_score: snap.spoof_score,
    spoof_reasons: snap.spoof_reasons, prod_score: snap.prod_score,
    alerts: act.checkAlerts(),
    summary: ['state_change','heartbeat','eod'].includes(type)
      ? act.daySummary(s.toISOString(), e.toISOString()) : undefined,
    timeline: type === 'eod' ? _localTl : undefined,
  };
}

// ── POST helper ────────────────────────────────────────────────────────────────
function post(parentIp, data, label) {
  const opts = {
    hostname: parentIp, port: C.DASHBOARD_PORT,
    path: '/api/child-report', method: 'POST', timeout: 8000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  };
  const req = http.request(opts, res => { _failStrikes = 0; res.resume(); });
  req.on('timeout', () => req.destroy());
  req.on('error', err => {
    log('SEND', err.message);
    if (['ECONNREFUSED','ETIMEDOUT','ECONNRESET','ENOTFOUND'].includes(err.code)) {
      _failStrikes++;
      log('SEND', 'Strike ' + _failStrikes + '/' + MAX_STRIKES + ' — ' + err.code);
      if (_failStrikes >= MAX_STRIKES) { _failStrikes = 0; loseConnection(); }
    }
  });
  req.write(data); req.end();
  log('SEND', (label || 'data') + ' → ' + parentIp);
}

function send(type) {
  if (_parentIp) post(_parentIp, JSON.stringify(buildPayload(type)), type);
}

// ── Reporting loop ─────────────────────────────────────────────────────────────
function startReporting(ip) {
  // Guard against multiple simultaneous startReporting calls
  if (_hbTimer || _parentIp) {
    log('CHILD', 'Already reporting — ignoring duplicate startReporting call');
    return;
  }
  _parentIp = ip;
  _failStrikes = 0;
  // DISABLED: blockBossDashboard blocked outbound TCP to boss on port 4000 — prevented heartbeats
  // blockBossDashboard(ip);
  send('state_change');

  _sampleTimer = setInterval(() => {
    const cur = act.getCurrentState();
    if (cur.state !== _lastState) { _lastState = cur.state; send('state_change'); }
    const hour = new Date().getHours();
    if (hour >= (C.EOD_HOUR || 18) && !_eodSent) {
      _eodSent = true; send('eod');
      setTimeout(() => { _eodSent = false; }, new Date().setHours(24,0,0,0) - Date.now());
    }
  }, C.SAMPLE_MS);

  _hbTimer  = setInterval(() => send('heartbeat'), C.HEARTBEAT_MS);
  _saveTimer = setInterval(() => store.saveTimeline(_localTl), 60_000);
  log('CHILD', `Reporting to ${ip}`);
}

// ── Shutdown hooks ─────────────────────────────────────────────────────────────
function registerShutdownHooks() {
  process.on('SIGTERM', () => sendLifecycleAlert('logout'));
  process.on('SIGINT',  () => { sendLifecycleAlert('shutdown'); process.exit(0); });
  process.on('SIGHUP',  () => sendLifecycleAlert('logout'));
}

// ── Employee local dashboard server ───────────────────────────────────────────
function startLocalDashboard() {
  // Remove any lingering firewall block rule from old versions
  try {
    const { execSync } = require('child_process');
    execSync('netsh advfirewall firewall delete rule name="PromptAI-BlockBoss" 2>nul', { stdio: 'ignore', timeout: 3000 });
  } catch(_) {}
  const fs = require('fs');
  const path = require('path');

  function fDur(m) {
    if (m === null || m === undefined) return '--';
    if (m === 0) return '0m';
    return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60 > 0 ? (m % 60) + 'm' : '');
  }

  function getDept() {
    try {
      const d = JSON.parse(fs.readFileSync(C.DEPT_FILE, 'utf8'));
      return d.dept || 'sales';
    } catch(_) { return 'sales'; }
  }

  const DEPT_NAMES = {
    sales: { name: 'Sales', icon: '📈', color: '#00e676' },
    engineering: { name: 'Engineering', icon: '💻', color: '#2979ff' },
    support: { name: 'Support', icon: '🎧', color: '#ffab00' },
    marketing: { name: 'Marketing', icon: '📣', color: '#ff3d57' },
    hr: { name: 'HR', icon: '👥', color: '#9c6dff' },
    finance: { name: 'Finance', icon: '💰', color: '#00e5ff' },
    executive: { name: 'Executive', icon: '🏢', color: '#ff9100' },
  };

  function buildDashboardHtml(summary, state, connected) {
    const dept = getDept();
    const deptInfo = DEPT_NAMES[dept] || { name: dept, icon: '📋', color: '#2979ff' };
    const prod = summary ? (summary.productive_pct || 0) : null;
    const focus = summary ? (summary.focus_score || 0) : null;
    const active = summary ? (summary.active_minutes || 0) : null;
    const idle = summary ? (summary.idle_minutes || 0) : null;
    const away = summary ? (summary.away_minutes || 0) : null;
    const firstActivity = summary && summary.first_activity ? new Date(summary.first_activity).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '--';
    const prodColor = prod === null ? '#4a6080' : prod >= 70 ? '#00e676' : prod >= 40 ? '#ffab00' : '#ff3d57';
    const stateColor = state === 'active' ? '#00e676' : state === 'idle' ? '#ffab00' : '#4a6080';
    const connBadge = connected
      ? `<span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.25)">🟢 Welcome to Work+</span>`
      : `<span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(255,171,0,.1);color:#ffab00;border:1px solid rgba(255,171,0,.25)">◌ Connecting to Manager...</span>`;

    return `<!DOCTYPE html><html><head><meta charset=utf-8>
    <title>My Dashboard - ${os.hostname()}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#07090f;color:#c8d8e8;font-family:Segoe UI,sans-serif;font-size:13px;min-height:100vh;user-select:none;-webkit-user-select:none;cursor:default;-webkit-app-region:drag}
      header{display:flex;align-items:center;gap:12px;padding:0 28px;height:54px;background:#0d1420;border-bottom:1px solid #1a2332;position:sticky;top:0;z-index:100;flex-wrap:wrap}
      .logo{font-size:17px;font-weight:800;color:#fff}.logo span{color:#00e676}
      .badge{padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700}
      .badge.emp{background:rgba(41,121,255,.1);color:#2979ff;border:1px solid rgba(41,121,255,.25)}
      main{padding:28px;display:flex;flex-direction:column;gap:20px;max-width:960px;margin:0 auto}
      .lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4a6080;margin-bottom:12px}
      .card{background:#0d1420;border:1px solid #1a2332;border-radius:10px;padding:20px}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
      .met{background:rgba(255,255,255,.03);border-radius:8px;padding:16px;border:1px solid #1a2332;text-align:center}
      .ml{font-size:9px;font-weight:700;text-transform:uppercase;color:#4a6080;margin-bottom:8px;letter-spacing:.1em}
      .mv{font-size:26px;font-weight:800;color:#fff}
      .mv.g{color:#00e676}.mv.a{color:#ffab00}.mv.r{color:#ff3d57}.mv.b{color:#2979ff}
      .status-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:${stateColor};margin-right:7px}
      .pill{display:inline-flex;align-items:center;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid transparent}
      .pill.active{background:rgba(0,230,118,.1);color:#00e676;border-color:rgba(0,230,118,.25)}
      .pill.idle{background:rgba(255,171,0,.1);color:#ffab00;border-color:rgba(255,171,0,.25)}
      .pill.away,.pill.offline,.pill.unknown{background:rgba(255,255,255,.04);color:#4a6080;border-color:#1a2332}
      .pb-wrap{display:flex;align-items:center;gap:10px;margin-top:14px}
      .pb-track{flex:1;height:7px;background:#111825;border-radius:4px;overflow:hidden}
      .pb-fill{height:100%;border-radius:4px;background:${prodColor};transition:width .5s}
      footer{padding:14px 28px;color:#4a6080;font-size:10px;border-top:1px solid #1a2332;background:#0d1420;text-align:left;margin-top:40px}
      input,button,a{cursor:pointer;user-select:none;-webkit-app-region:no-drag}
      input[type=text]{cursor:text;user-select:text}
      ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0d1117}::-webkit-scrollbar-thumb{background:#1a2332;border-radius:2px}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    </style></head><body>
    <header>
      <div class=logo>Prompt AI <span>Work+</span></div>
      <span class="badge emp">👤 Employee</span>
      <span class="badge" style="background:rgba(0,230,118,.08);color:${deptInfo.color};border:1px solid ${deptInfo.color}33">${deptInfo.icon} ${deptInfo.name}</span>
      ${connBadge}
      <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,230,118,.06);color:#00e676;border:1px solid rgba(0,230,118,.2);margin-left:4px" title="All data stored locally on this PC - nothing sent externally"><svg width=11 height=11 viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M12 2L3 7v5c0 5.25 3.9 10.15 9 11.35C17.1 22.15 21 17.25 21 12V7L12 2z" fill="rgba(0,230,118,.3)" stroke="#00e676" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="#00e676" stroke-width="2" stroke-linecap="round"/></svg>100% Local</span>
      <span id=pp-badge title="View Privacy Policy &amp; Employee Consent" style=display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(41,121,255,.12);color:#2979ff;border:1.5px solid rgba(41,121,255,.4);margin-left:6px;cursor:pointer;white-space:nowrap;text-decoration:underline;text-underline-offset:3px>&#128274; Privacy &amp; Consent</span>
      <span style="margin-left:auto;font-size:11px;color:#4a6080" id=clk></span>
    </header>
    <nav style="display:flex;background:#0d1420;border-bottom:1px solid #1a2332;padding:0 28px">
      <a href="#" id=nav-dash onclick="showTab('dash');return false;" style="padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;text-decoration:none;border-bottom:2px solid #00e676;color:#00e676;letter-spacing:.06em">Overview</a>
      <a href="#" id=nav-tl onclick="showTab('tl');return false;" style="padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a6080;text-decoration:none;border-bottom:2px solid transparent;letter-spacing:.06em">My Timeline</a>
      <a href="#" id=nav-wp onclick="showTab('wp');return false;" style="padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a6080;text-decoration:none;border-bottom:2px solid transparent;letter-spacing:.06em">&#129302; Work+</a>
    </nav>
    <div id=tab-dash>
    <main>

      <div>
        <div class=lbl>My Status — ${os.hostname()}</div>
        <div class=card style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
          <div style="display:flex;align-items:center;gap:10px">
            <span class=status-dot style="animation:${state==='active'?'pulse 2s infinite':'none'}"></span>
            <span class="pill ${state}" id=live-state>${state}</span>
          </div>
          <div style="font-size:11px;color:#4a6080">First activity today: <strong style=color:#c8d8e8>${firstActivity}</strong></div>
          <div style="font-size:11px;color:#4a6080" id=live-ts>Refreshing...</div>
        </div>
      </div>

      <div>
        <div class=lbl>My Performance Today</div>
        <div class=card>
          <div class=grid>
            <div class=met>
              <div class=ml>Productive</div>
              <div class="mv ${prod===null?'':prod>=70?'g':prod>=40?'a':'r'}" id=live-prod>${prod !== null ? prod+'%' : '--'}</div>
            </div>
            <div class=met>
              <div class=ml>Focus Score</div>
              <div class="mv ${focus===null?'':focus>=70?'g':focus>=40?'a':'r'}" id=live-focus>${focus !== null ? focus+'/100' : '--'}</div>
            </div>
            <div class=met>
              <div class=ml>Active Time</div>
              <div class="mv g" id=live-active>${fDur(active)}</div>
            </div>
            <div class=met>
              <div class=ml>Idle Time</div>
              <div class=mv id=live-idle>${fDur(idle)}</div>
            </div>
            <div class=met>
              <div class=ml>Away Time</div>
              <div class="mv a" id=live-away>${fDur(away)}</div>
            </div>
          </div>
          <div class=pb-wrap>
            <span style="font-size:10px;color:#4a6080;min-width:80px">Productivity</span>
            <div class=pb-track><div class=pb-fill id=live-bar style="width:${prod||0}%"></div></div>
            <span style="font-size:12px;font-weight:700;color:${prodColor};min-width:36px;text-align:right" id=live-prod2>${prod !== null ? prod+'%' : '--'}</span>
          </div>
        </div>
      </div>

      <div>
        <div class=lbl>Quick Message to Boss</div>
        <div class=card>
          <div style="font-size:11px;color:#4a6080;margin-bottom:10px">Send a quick note to your manager. They will see it immediately in the Alerts tab.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <button onclick="sendQuickMsg('Hey! Just checking in.')" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(0,230,118,.08);color:#00e676;border:1px solid rgba(0,230,118,.2);cursor:pointer">&#128075; Hey!</button>
            <button onclick="sendQuickMsg('All good on my end!')" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(41,121,255,.08);color:#2979ff;border:1px solid rgba(41,121,255,.2);cursor:pointer">&#9989; All good</button>
            <button onclick="sendQuickMsg('Need help with something.')" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(255,61,87,.08);color:#ff3d57;border:1px solid rgba(255,61,87,.2);cursor:pointer">&#128308; Need help</button>
            <button onclick="sendQuickMsg('Taking a short break.')" style="padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(255,171,0,.08);color:#ffab00;border:1px solid rgba(255,171,0,.2);cursor:pointer">&#9749; On break</button>
          </div>
          <div style="display:flex;gap:8px">
            <input id=msg-input type=text maxlength=120 placeholder="Type a custom message..." style="flex:1;padding:8px 12px;border-radius:8px;background:#111825;border:1px solid #1a2332;color:#c8d8e8;font-size:12px;outline:none" onkeydown="if(event.key==='Enter')sendQuickMsg(document.getElementById('msg-input').value)">
            <button onclick="sendQuickMsg(document.getElementById('msg-input').value)" style="padding:8px 18px;border-radius:8px;font-size:12px;font-weight:700;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.25);cursor:pointer">Send</button>
          </div>
          <div id=msg-status style="font-size:10px;color:#4a6080;margin-top:8px;min-height:16px"></div>
        </div>
      </div>

      <div>
        <div class=lbl>Connection Status</div>
        <div class=card>
          <div id=conn-status style="font-size:12px;color:#4a6080">
            ${connected
              ? `<span style=color:#00e676>✓ Connected to Work+.</span> Your activity is being reported in real time.`
              : `<span style=color:#ffab00>⏳ Searching for manager PC on the network...</span> Data will appear once connected. If this takes too long, run <strong>SET-BOSS-IP.bat</strong> and enter the manager's IP address.`}
          </div>
        </div>
      </div>

    </main>
    </div>

    <div id=tab-tl style=display:none>
    <main style="padding:28px;display:flex;flex-direction:column;gap:20px;max-width:1100px;margin:0 auto">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4a6080;margin-bottom:12px">My Timeline Today</div>
        <div style="background:#0d1420;border:1px solid rgba(0,230,118,.3);border-radius:10px;padding:24px">
          <div id=tl-swim style="display:flex;height:26px;border-radius:6px;overflow:hidden;background:#111825;margin-bottom:12px"><div style="color:#4a6080;font-size:10px;padding:4px">Loading...</div></div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:10px;color:#4a6080;margin-bottom:20px">
            <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#00e676;display:inline-block"></span>Active</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#ffab00;display:inline-block"></span>Idle</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#1c2a3a;display:inline-block"></span>Away</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#2979ff;display:inline-block"></span>Locked</span>
            <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:#ff3d57;display:inline-block"></span>Spoofed</span>
          </div>
          <div id=tl-sumg style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:20px"></div>
          <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4a6080;margin-bottom:10px">Activity Log</div>
          <div id=tl-log style="max-height:340px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>
          <div style="font-size:9px;color:#4a6080;margin-top:10px" id=tl-updated>Loading timeline...</div>
        </div>
      </div>
    </main>
    </div>

    <div id=tab-wp style=display:none>
    <main style="padding:28px;max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:24px">

      <!-- Hero -->
      <div style="text-align:center;padding:32px 20px 24px;border-bottom:1px solid #1a2332">
        <div style="font-size:32px;margin-bottom:10px">&#129302;</div>
        <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px">AI Tools for You</div>
        <div style="font-size:12px;color:#4a6080;max-width:460px;margin:0 auto;line-height:1.7">Curated AI tools recommended for your role by your manager. More tools will be added over time.</div>
        <div id=wp-dept-badge style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(0,230,118,.08);color:#00e676;border:1px solid rgba(0,230,118,.2)">Loading...</div>
      </div>

      <!-- Privacy Break Log -->
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4a6080;margin-bottom:12px">&#128274; Privacy Break Log</div>
        <div style="background:#0d1117;border:1px solid #1a2332;border-radius:10px;padding:16px">
          <div id=wp-privacy-log style="font-size:11px;color:#4a6080">No privacy breaks recorded today.</div>
        </div>
      </div>

      <!-- AI Tools Grid -->
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4a6080;margin-bottom:12px">Recommended Tools</div>
        <div id=wp-tools-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px"></div>
        <div style="text-align:center;padding:24px;color:#2a3a4a;font-size:11px;margin-top:8px">&#128273; More tools coming soon &mdash; approved by your manager</div>
      </div>

    </main>
    </div>

    <footer style="padding:18px 28px;color:#4a6080;font-size:10px;border-top:1px solid rgba(0,230,118,.2);background:#0d1420;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:42px;height:42px;border-radius:50%;background:#0d1117;border:2px solid #00e676;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(0,230,118,.4);flex-shrink:0">
          <svg width=22 height=22 viewBox='0 0 24 24' fill='none'><path d='M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z' fill='rgba(0,230,118,.15)' stroke='#00e676' stroke-width='1.5'/><circle cx='12' cy='10' r='3' fill='#00e676'/><path d='M6 17c1.5-2 3.5-3 6-3s4.5 1 6 3' stroke='#00e676' stroke-width='1.5' stroke-linecap='round'/></svg>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px">
          <span style="font-size:12px;font-weight:800;color:#fff">Prompt AI Work+</span>
          <span style="font-size:9px;color:#4a6080">Prompt AI Ethical Solutions USA</span>
          <div style="display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap">
            <a href="tel:+18442154747" style="font-size:11px;font-weight:800;color:#00e676;text-decoration:none">1(844)215-4747</a>
            <span style="color:#1a2332">|</span>
            <a href="mailto:support@promptaiusa.com" style="font-size:9px;color:#4a6080;text-decoration:none">support@promptaiusa.com</a>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
            <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:9px;font-weight:700;background:rgba(0,230,118,.06);color:#00e676;border:1px solid rgba(0,230,118,.2)"><svg width=9 height=9 viewBox="0 0 24 24" fill="none"><path d="M12 2L3 7v5c0 5.25 3.9 10.15 9 11.35C17.1 22.15 21 17.25 21 12V7L12 2z" fill="rgba(0,230,118,.3)" stroke="#00e676" stroke-width="2.5"/><path d="M9 12l2 2 4-4" stroke="#00e676" stroke-width="2.5" stroke-linecap="round"/></svg>v14.0 | 100% Local</span>
            <a href="#" onclick="showPrivacyPolicyEmp();return false;" style="display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:700;color:#2979ff;text-decoration:underline;text-underline-offset:2px;cursor:pointer">&#128274; Privacy Policy &amp; Consent</a>
          </div>
        </div>
      </div>
      <span style="font-size:9px;color:#1e2d3d;text-align:right">Employee View<br>${os.hostname()}</span>
    </footer>

    <!-- Floating Action Buttons -->
    <div id="emp-fab" style="position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:9000">
      <button id="deep-work-btn"  style="padding:9px 16px;border-radius:8px;font-size:11px;font-weight:700;background:rgba(41,121,255,.1);color:#2979ff;border:1px solid rgba(41,121,255,.25);cursor:pointer;white-space:nowrap">Deep Work Mode</button>
      <button id="privacy-toggle-btn"  style="padding:9px 16px;border-radius:8px;font-size:11px;font-weight:700;background:rgba(41,121,255,.1);color:#2979ff;border:1px solid rgba(41,121,255,.25);cursor:pointer;white-space:nowrap">&#128274; Privacy Break</button>
      <button id="req-ethics-btn"  style="padding:9px 16px;border-radius:8px;font-size:11px;font-weight:700;background:rgba(0,230,118,.08);color:#00e676;border:1px solid rgba(0,230,118,.2);cursor:pointer;white-space:nowrap">&#128203; Request Ethics Report</button>
    </div>
    <script>
      setInterval(function(){var e=document.getElementById('clk');if(e)e.textContent=new Date().toLocaleTimeString();},1000);
      function fd(m){if(m===null||m===undefined)return'--';if(m===0)return'0m';return m<60?m+'m':Math.floor(m/60)+'h '+(m%60>0?(m%60)+'m':'');}
      async function refresh(){
        try{
          var d=await fetch('/api/emp-self').then(r=>r.json());
          if(d.hostname) window._empHostname=d.hostname;
          var ts=document.getElementById('live-ts');if(ts)ts.textContent='Updated: '+new Date().toLocaleTimeString();
          var ss=document.getElementById('live-state');if(ss){ss.textContent=d.state;ss.className='pill '+(d.state||'unknown');}
          if(d.summary){
            var p=d.summary.productive_pct||0;
            var ep=document.getElementById('live-prod');if(ep){ep.textContent=p+'%';ep.className='mv '+(p>=70?'g':p>=40?'a':'r');}
            var ep2=document.getElementById('live-prod2');if(ep2){ep2.textContent=p+'%';}
            var bar=document.getElementById('live-bar');if(bar)bar.style.width=p+'%';
            var ef=document.getElementById('live-focus');var fs=d.summary.focus_score||0;if(ef){ef.textContent=fs+'/100';ef.className='mv '+(fs>=70?'g':fs>=40?'a':'r');}
            var ea=document.getElementById('live-active');if(ea)ea.textContent=fd(d.summary.active_minutes);
            var ei=document.getElementById('live-idle');if(ei)ei.textContent=fd(d.summary.idle_minutes);
            var ew=document.getElementById('live-away');if(ew)ew.textContent=fd(d.summary.away_minutes);
          }
        }catch(e){}
        // Check for boss replies after hostname is confirmed
        if(window._empHostname) checkBossReplies();
      }
      refresh();setInterval(refresh,10000);

      // ── Poll for boss replies ─────────────────────────────────────────────────
      var _shownMsgIds={};
      function checkBossReplies(){
        var hn=window._empHostname||'${os.hostname()}';
        fetch('/api/messages?host='+encodeURIComponent(hn))
          .then(function(r){return r.json();})
          .then(function(data){
            var msgs=(data.messages||[]).filter(function(m){return m.from==='Boss';});
            msgs.forEach(function(m){
              if(_shownMsgIds[m.id])return;
              _shownMsgIds[m.id]=true;
              showBossReply(m);
            });
          }).catch(function(){});
      }
      function showBossReply(reply){
        // Remove any existing boss message banner
        var exBanner=document.getElementById('boss-msg-banner');
        if(exBanner)exBanner.remove();

        // Full-width banner at top of page (below header+nav)
        var banner=document.createElement('div');
        banner.id='boss-msg-banner';
        banner.style.cssText='position:sticky;top:54px;left:0;right:0;z-index:8000;background:linear-gradient(135deg,#0d1d35,#0d2045);border-bottom:2px solid rgba(41,121,255,.6);padding:14px 28px;display:flex;align-items:center;gap:16px;box-shadow:0 4px 20px rgba(41,121,255,.2);animation:bossMsg .4s ease';

        var style=document.getElementById('boss-msg-style');
        if(!style){
          style=document.createElement('style');
          style.id='boss-msg-style';
          style.textContent='@keyframes bossMsg{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}';
          document.head.appendChild(style);
        }

        // Icon
        var ico=document.createElement('div');
        ico.style.cssText='width:36px;height:36px;border-radius:50%;background:rgba(41,121,255,.2);border:2px solid rgba(41,121,255,.5);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0';
        ico.textContent='💬';

        // Content
        var content=document.createElement('div');
        content.style.cssText='flex:1;min-width:0';
        var label=document.createElement('div');
        label.style.cssText='font-size:10px;font-weight:700;color:#2979ff;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px';
        label.textContent='Message from Boss • '+new Date(reply.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        var msg=document.createElement('div');
        msg.style.cssText='font-size:14px;font-weight:600;color:#fff;line-height:1.4';
        msg.textContent=reply.message;
        content.appendChild(label);content.appendChild(msg);

        // Action buttons
        var acts=document.createElement('div');
        acts.style.cssText='display:flex;gap:8px;flex-shrink:0;align-items:center;flex-wrap:wrap';

        // Reply button - expands inline input
        var replyBtn=document.createElement('button');
        replyBtn.textContent='Reply';
        replyBtn.style.cssText='padding:7px 16px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.3);cursor:pointer;white-space:nowrap';
        replyBtn.onclick=function(){
          var exRow=document.getElementById('boss-reply-row');
          if(exRow){exRow.remove();replyBtn.textContent='Reply';return;}
          replyBtn.textContent='Cancel';
          var row=document.createElement('div');
          row.id='boss-reply-row';
          row.style.cssText='display:flex;gap:8px;width:100%;padding:10px 28px 12px;background:rgba(0,0,0,.2);border-top:1px solid rgba(41,121,255,.2)';
          var inp=document.createElement('input');
          inp.type='text';inp.maxLength=120;
          inp.placeholder='Type your reply to boss...';
          inp.style.cssText='flex:1;padding:8px 12px;border-radius:8px;background:#111825;border:1px solid rgba(41,121,255,.3);color:#c8d8e8;font-size:12px;outline:none';
          var send=document.createElement('button');
          send.textContent='Send Reply';
          send.style.cssText='padding:8px 18px;border-radius:8px;font-size:11px;font-weight:700;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.3);cursor:pointer;white-space:nowrap';
          send.onclick=function(){
            var txt=(inp.value||'').trim();
            if(!txt)return;
            send.textContent='Sending...';send.disabled=true;
            var hn=window._empHostname||'Employee';
            var rhn = window._empHostname || '${os.hostname()}';
            fetch('/api/messages?host='+encodeURIComponent(rhn),{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({message:txt})
            }).then(function(r){return r.json();}).then(function(){
              send.textContent='Sent!';send.style.color='#00e676';
              inp.value='';
              setTimeout(function(){banner.remove();},1500);
            }).catch(function(){send.textContent='Failed';send.disabled=false;});
          };
          inp.onkeydown=function(e){if(e.key==='Enter')send.onclick();};
          row.appendChild(inp);row.appendChild(send);
          // Insert row below banner
          banner.after(row);
          setTimeout(function(){inp.focus();},50);
        };

        // Dismiss button
        var close=document.createElement('button');
        close.textContent='Dismiss';
        close.style.cssText='padding:7px 14px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(255,255,255,.05);color:#4a6080;border:1px solid #1a2332;cursor:pointer;white-space:nowrap';
        close.onclick=function(){
          var row=document.getElementById('boss-reply-row');if(row)row.remove();
          banner.remove();
        };

        acts.appendChild(replyBtn);acts.appendChild(close);
        banner.appendChild(ico);banner.appendChild(content);banner.appendChild(acts);

        // Insert after nav (before first tab div)
        var nav=document.querySelector('nav');
        if(nav&&nav.nextSibling){nav.parentNode.insertBefore(banner,nav.nextSibling);}
        else{document.body.insertBefore(banner,document.body.firstChild);}

        // Auto-dismiss after 60s (longer so emp has time to reply)
        setTimeout(function(){
          var row=document.getElementById('boss-reply-row');if(row)row.remove();
          if(banner.parentNode)banner.remove();
        },60000);
      }
      setInterval(checkBossReplies,10000); // poll every 15s
      checkBossReplies(); // check on load

      // ── Employee Feature Pack ────────────────────────────────────────────────
      var _privacyModeEmp = false;
      var _deepWorkModeEmp = false;
      var _killedProcs = {};
      var _BOSS_PORT = 4000;

      // ── Privacy Break ────────────────────────────────────────────────────────
      function togglePrivacyEmp(){
        if(!_privacyModeEmp){
          _pbStart=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        } else if(_pbStart){
          _privacyBreaks.push({start:_pbStart,end:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})});
          _pbStart=null;
        }
        _privacyModeEmp = !_privacyModeEmp;
        var btn = document.getElementById('privacy-toggle-btn');
        if(btn){
          btn.textContent = _privacyModeEmp ? 'Resume Tracking' : '\uD83D\uDD12 Privacy Break';
          btn.style.background = _privacyModeEmp ? 'rgba(255,61,87,.1)' : 'rgba(41,121,255,.1)';
          btn.style.color = _privacyModeEmp ? '#ff3d57' : '#2979ff';
          btn.style.borderColor = _privacyModeEmp ? 'rgba(255,61,87,.3)' : 'rgba(41,121,255,.25)';
        }
        fetch('/api/privacy-mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:_privacyModeEmp})}).catch(function(){});
        var ex = document.getElementById('privacy-overlay-emp');
        if(ex){ex.remove();return;}
        if(_privacyModeEmp){
          var ov = document.createElement('div');
          ov.id = 'privacy-overlay-emp';
          ov.style.cssText = 'position:fixed;top:54px;left:0;right:0;bottom:0;background:rgba(7,9,15,.97);z-index:8888;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';
          var t = document.createElement('div');
          t.style.cssText = 'font-size:30px;font-weight:800;color:#fff';
          t.textContent = 'Privacy Break';
          var s = document.createElement('div');
          s.style.cssText = 'font-size:13px;color:#4a6080';
          s.textContent = 'Tracking is paused. Your activity is not being monitored.';
          var rb = document.createElement('button');
          rb.textContent = 'Resume Tracking';
          rb.style.cssText = 'padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.25);cursor:pointer;margin-top:8px';
          rb.onclick = togglePrivacyEmp;
          ov.appendChild(t); ov.appendChild(s); ov.appendChild(rb);
          document.body.appendChild(ov);
        }
      }

      // ── Deep Work Mode ───────────────────────────────────────────────────────
      var NON_ESSENTIAL_PROCS = [
        {name:'MsMpEng',label:'Windows Defender (scan)',safe:true},
        {name:'TiWorker',label:'Windows Update Worker',safe:true},
        {name:'WmiPrvSE',label:'WMI Provider Host',safe:true},
        {name:'SearchIndexer',label:'Search Indexer',safe:true},
        {name:'OneDrive',label:'OneDrive Sync',safe:true},
        {name:'Teams',label:'Microsoft Teams',safe:true},
        {name:'Slack',label:'Slack (background)',safe:true},
      ];

      function toggleDeepWorkEmp(){
        _deepWorkModeEmp = !_deepWorkModeEmp;
        var btn = document.getElementById('deep-work-btn');
        if(btn){
          btn.textContent = _deepWorkModeEmp ? 'Exit Deep Work' : 'Deep Work Mode';
          btn.style.background = _deepWorkModeEmp ? 'rgba(0,230,118,.15)' : 'rgba(41,121,255,.1)';
          btn.style.color = _deepWorkModeEmp ? '#00e676' : '#2979ff';
          btn.style.borderColor = _deepWorkModeEmp ? 'rgba(0,230,118,.3)' : 'rgba(41,121,255,.25)';
        }
        if(_deepWorkModeEmp){ showDeepWorkEmp(); }
        else { var p = document.getElementById('deep-work-panel'); if(p) p.remove(); }
      }

      function showDeepWorkEmp(){
        var ex = document.getElementById('deep-work-panel'); if(ex) ex.remove();
        fetch('/api/sysmetrics').then(function(r){return r.json();}).then(function(data){
          var procs = (data.processes||data.procs||[]).filter(function(p){return p.cpu>5;});
          var panel = document.createElement('div');
          panel.id = 'deep-work-panel';
          panel.style.cssText = 'position:fixed;top:60px;right:20px;background:#0d1117;border:1px solid #00e676;border-radius:12px;padding:20px;width:320px;z-index:9500;box-shadow:0 4px 24px rgba(0,0,0,.6)';
          var hdr = document.createElement('div');
          hdr.style.cssText = 'font-size:13px;font-weight:700;color:#00e676;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center';
          var htxt = document.createElement('span'); htxt.textContent = 'Deep Work Mode Active';
          var cx = document.createElement('button');
          cx.textContent = '\u2715'; cx.style.cssText = 'background:none;border:none;color:#4a6080;cursor:pointer;font-size:14px';
          cx.onclick = toggleDeepWorkEmp;
          hdr.appendChild(htxt); hdr.appendChild(cx);
          var sub = document.createElement('div');
          sub.style.cssText = 'font-size:10px;color:#4a6080;margin-bottom:14px';
          sub.textContent = 'Kill background processes to free up resources for deep focus.';
          panel.appendChild(hdr); panel.appendChild(sub);
          var found = 0;
          NON_ESSENTIAL_PROCS.forEach(function(np){
            if(_killedProcs[np.name.toLowerCase()]) return;
            var match = procs.find(function(p){return p.name.toLowerCase().includes(np.name.toLowerCase());});
            if(!match && !np.safe) return;
            found++;
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:0.5px solid #1a2332';
            var info = document.createElement('div');
            info.style.cssText = 'font-size:11px;color:#ccd6f0';
            info.textContent = np.label + (match ? ' ('+match.cpu+'% CPU)' : '');
            var kb = document.createElement('button');
            kb.textContent = 'Kill';
            kb.style.cssText = 'padding:3px 10px;border-radius:5px;font-size:10px;font-weight:700;background:#ff3d57;color:#fff;border:none;cursor:pointer';
            var pn = np.name;
            kb.onclick = function(){
              if(!confirm('Kill '+pn+'? It will not restart until reboot.')) return;
              fetch('/api/kill-process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:pn,force:true})})
                .then(function(r){return r.json();}).then(function(d){
                  if(d.ok){_killedProcs[pn.toLowerCase()]=true;kb.textContent='Killed';kb.style.background='rgba(0,230,118,.15)';kb.style.color='#00e676';row.style.opacity='0.4';}
                }).catch(function(){});
            };
            row.appendChild(info); row.appendChild(kb); panel.appendChild(row);
          });
          if(found===0){
            var none = document.createElement('div');
            none.style.cssText = 'font-size:11px;color:#4a6080;padding:10px 0';
            none.textContent = 'No background processes detected. PC is running clean!';
            panel.appendChild(none);
          }
          document.body.appendChild(panel);
        }).catch(function(){});
      }

      // ── Request Ethics Report — alerts boss immediately ───────────────────────
      function requestEthicsReport(){
        var btn = document.getElementById('req-ethics-btn');
        if(btn){ btn.textContent = 'Sending...'; btn.disabled = true; }
        fetch('/api/create-alert',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            type:'ethics_request',
            hostname:window._empHostname||window.location.hostname||'Employee',
            message:'\uD83D\uDCCB Ethics Report Requested by '+window.location.hostname+' — Please review in boss dashboard.',
            severity:'warn'
          })
        }).then(function(r){return r.json();}).then(function(){
          if(btn){
            btn.textContent = '\u2705 Sent to Boss!';
            btn.style.background = 'rgba(0,230,118,.15)';
            btn.style.color = '#00e676';
            setTimeout(function(){
              btn.textContent = '\uD83D\uDCCB Request Ethics Report';
              btn.style.background = 'rgba(0,230,118,.08)';
              btn.style.color = '#00e676';
              btn.disabled = false;
            }, 4000);
          }
        }).catch(function(){
          if(btn){btn.textContent = '\uD83D\uDCCB Request Ethics Report'; btn.disabled = false;}
        });
      }

      // -- Privacy Policy Modal -- pure DOM, no innerHTML --
      function showPrivacyPolicyEmp(){
        var ex=document.getElementById('pp-modal-emp');if(ex){ex.remove();return;}
        var ov=document.createElement('div');
        ov.id='pp-modal-emp';
        ov.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center';
        ov.onclick=function(e){if(e.target===ov)ov.remove();};

        var box=document.createElement('div');
        box.style.cssText='background:#0d1420;border:1.5px solid rgba(0,230,118,.3);border-radius:14px;width:560px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column';

        var hdr=document.createElement('div');
        hdr.style.cssText='padding:20px 24px;border-bottom:1px solid #1a2332;display:flex;justify-content:space-between;align-items:center;flex-shrink:0';
        var htxt=document.createElement('div');
        var ht=document.createElement('div');ht.style.cssText='font-size:15px;font-weight:800;color:#fff';ht.textContent='Privacy Policy & Consent';
        var hs=document.createElement('div');hs.style.cssText='font-size:10px;color:#4a6080;margin-top:3px';hs.textContent='Prompt AI Ethical Solutions USA LLC';
        htxt.appendChild(ht);htxt.appendChild(hs);
        var xb=document.createElement('button');xb.textContent='x';xb.style.cssText='background:none;border:none;color:#4a6080;cursor:pointer;font-size:18px';xb.onclick=function(){ov.remove();};
        hdr.appendChild(htxt);hdr.appendChild(xb);

        var body=document.createElement('div');
        body.style.cssText='padding:20px 24px;overflow-y:auto;flex:1;font-size:12px;color:#9aa5b4;line-height:1.9';

        function addNotice(){
          var wrap=document.createElement('div');
          wrap.style.cssText='background:rgba(0,230,118,.06);border:1px solid rgba(0,230,118,.2);border-radius:8px;padding:12px 16px;margin-bottom:16px';
          var t=document.createElement('div');t.style.cssText='font-size:11px;font-weight:700;color:#00e676;margin-bottom:4px';t.textContent='Employee Monitoring Notice';
          var d=document.createElement('div');d.style.cssText='font-size:11px;color:#ccd6f0';d.textContent='This system monitors work activity to measure performance. By using this device during work hours, you consent to the monitoring described below.';
          wrap.appendChild(t);wrap.appendChild(d);body.appendChild(wrap);
        }
        function addSection(title, items){
          var t=document.createElement('div');t.style.cssText='font-size:13px;font-weight:700;color:#fff;margin:14px 0 6px';t.textContent=title;body.appendChild(t);
          items.forEach(function(item){
            var d=document.createElement('div');d.style.cssText='margin-bottom:3px';
            if(item.red){d.style.color='#ff6b6b';}
            d.textContent=item.text;
            body.appendChild(d);
          });
        }

        addNotice();
        addSection('1. What We Monitor',[
          {text:'Keyboard and mouse activity (frequency only - keystrokes NOT recorded)'},
          {text:'Active application window titles (app name only - screen NOT captured)'},
          {text:'Screen lock and unlock events'},
          {text:'System idle and away periods'},
          {text:'Login and logout times'},
          {text:'CPU and RAM usage'},
          {text:'Browser tab titles (blocked site detection only)'},
        ]);
        addSection('2. What We Do NOT Monitor',[
          {text:'Screen recording or screenshots',red:true},
          {text:'Keystroke logging or typed content',red:true},
          {text:'Personal files, emails, or messages',red:true},
          {text:'Internet browsing history or content',red:true},
          {text:'Audio or microphone monitoring',red:true},
          {text:'Any data sent to external servers',red:true},
        ]);
        addSection('3. Data Storage & Privacy',[
          {text:'All data stored exclusively on your local company machines.'},
          {text:'No data transmitted to cloud or external networks.'},
          {text:'Data retained 48 hours, accessible only to authorized supervisors.'},
        ]);
        addSection('4. Your Rights',[
          {text:'You may request a copy of your productivity data at any time.'},
          {text:'Use Privacy Break button to pause monitoring during personal breaks.'},
          {text:'Monitoring occurs only during scheduled work hours.'},
          {text:'You may discuss your performance data with your supervisor.'},
        ]);
        addSection('5. Consent',[
          {text:'By continuing to use this device you confirm you have read this policy and consent to the monitoring described above.'},
        ]);

        var note=document.createElement('div');
        note.style.cssText='font-size:10px;color:#4a6080;margin-top:16px;padding-top:12px;border-top:1px solid #1a2332';
        note.textContent='Prompt AI Ethical Solutions USA LLC | support@promptaiusa.com | 1(844)215-4747';
        body.appendChild(note);

        var foot=document.createElement('div');
        foot.style.cssText='padding:16px 24px;border-top:1px solid #1a2332;display:flex;gap:10px;flex-shrink:0';
        var ack=document.createElement('button');
        ack.textContent='I Have Read & Acknowledge';
        ack.style.cssText='flex:1;padding:10px;border-radius:8px;font-size:12px;font-weight:700;background:rgba(41,121,255,.1);color:#2979ff;border:1px solid rgba(41,121,255,.3);cursor:pointer';
        ack.onclick=function(){ack.textContent='Acknowledged';ack.style.background='rgba(0,230,118,.1)';ack.style.color='#00e676';setTimeout(function(){ov.remove();},1000);};
        var cl=document.createElement('button');
        cl.textContent='Close';
        cl.style.cssText='padding:10px 20px;border-radius:8px;font-size:12px;color:#4a6080;border:1px solid #1a2332;background:none;cursor:pointer';
        cl.onclick=function(){ov.remove();};
        foot.appendChild(ack);foot.appendChild(cl);

        box.appendChild(hdr);box.appendChild(body);box.appendChild(foot);
        ov.appendChild(box);document.body.appendChild(ov);
      }

      // ── Quick message to boss ────────────────────────────────────────────────
      function sendQuickMsg(msg){
        msg = (msg || '').trim();
        var st = document.getElementById('msg-status');
        if(!msg){if(st){st.textContent='Please type a message.';st.style.color='#ffab00';}return;}
        if(st){st.textContent='Sending...';st.style.color='#4a6080';}
        var hn = window._empHostname || '${os.hostname()}';
        fetch('/api/messages?host='+encodeURIComponent(hn),{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({message:msg})
        }).then(function(){
          if(st){st.textContent='Sent!';st.style.color='#00e676';}
          var inp=document.getElementById('msg-input');if(inp)inp.value='';
          setTimeout(function(){if(st)st.textContent='';},3000);
        }).catch(function(){
          if(st){st.textContent='Failed.';st.style.color='#ff3d57';}
          setTimeout(function(){if(st)st.textContent='';},3000);
        });
      }

      // ── Tab switching ─────────────────────────────────────────────────────────
      function showTab(tab){
        document.getElementById('tab-dash').style.display=tab==='dash'?'':'none';
        document.getElementById('tab-tl').style.display=tab==='tl'?'':'none';
        var twp=document.getElementById('tab-wp');if(twp)twp.style.display=tab==='wp'?'':'none';
        var nd=document.getElementById('nav-dash'),nt=document.getElementById('nav-tl'),nw=document.getElementById('nav-wp');
        if(nd){nd.style.color=tab==='dash'?'#00e676':'#4a6080';nd.style.borderBottomColor=tab==='dash'?'#00e676':'transparent';}
        if(nt){nt.style.color=tab==='tl'?'#00e676':'#4a6080';nt.style.borderBottomColor=tab==='tl'?'#00e676':'transparent';}
        if(nw){nw.style.color=tab==='wp'?'#00e676':'#4a6080';nw.style.borderBottomColor=tab==='wp'?'#00e676':'transparent';}
        if(tab==='tl')loadTimeline();
        if(tab==='wp')loadWorkPlus();
      }

      // ── Timeline loader ───────────────────────────────────────────────────────
      var _tlBusy=false;
      function fDurTl(m){if(!m&&m!==0)return'--';if(m===0)return'0m';return m<60?m+'m':Math.floor(m/60)+'h '+(m%60>0?(m%60)+'m':'');}
      function loadTimeline(){
        if(_tlBusy)return;_tlBusy=true;
        fetch('/api/emp-timeline').then(function(r){return r.json();}).then(function(data){
          _tlBusy=false;
          var tl=data.timeline||[],ds=data.summary;
          var swim=document.getElementById('tl-swim');
          if(swim){swim.innerHTML=tl.length?tl.map(function(w){var col=w.state==='active'?'#00e676':w.state==='idle'?'#ffab00':w.state==='locked'?'#2979ff':w.state==='spoofed'?'#ff3d57':'#1c2a3a';return '<div style=flex:1;height:100%;background:'+col+'></div>';}).join(''):'<div style=color:#4a6080;font-size:10px;padding:4px>No activity yet</div>';}
          var sg=document.getElementById('tl-sumg');
          if(sg&&ds){sg.innerHTML=[{l:'Productive',v:(ds.productive_pct||0)+'%',c:ds.productive_pct>=70?'#00e676':ds.productive_pct>=40?'#ffab00':'#ff3d57'},{l:'Focus',v:(ds.focus_score||0)+'/100',c:ds.focus_score>=70?'#00e676':ds.focus_score>=40?'#ffab00':'#ff3d57'},{l:'Active',v:fDurTl(ds.active_minutes),c:'#00e676'},{l:'Idle',v:fDurTl(ds.idle_minutes),c:'#ffab00'},{l:'Away',v:fDurTl(ds.away_minutes),c:'#4a6080'},{l:'Locked',v:fDurTl(ds.locked_minutes||0),c:'#2979ff'},{l:'Last Login',v:ds.login_time||'--',c:'#2979ff'},{l:'Spoof',v:(ds.spoofed_windows||0)>0?(ds.spoofed_windows+' !'):'0',c:ds.spoofed_windows>0?'#ff3d57':'#00e676'}].map(function(x){return '<div style=background:rgba(255,255,255,.03);border-radius:8px;padding:12px 14px;border:1px solid #1a2332><div style=font-size:9px;font-weight:700;text-transform:uppercase;color:#4a6080;margin-bottom:5px>'+x.l+'</div><div style=font-size:22px;font-weight:800;color:'+x.c+'>'+x.v+'</div></div>';}).join('');}
          var log=document.getElementById('tl-log');
          if(log){log.innerHTML=tl.length?tl.slice(-60).reverse().map(function(w){var col=w.state==='active'?'#00e676':w.state==='idle'?'#ffab00':w.state==='locked'?'#2979ff':w.state==='spoofed'?'#ff3d57':'#4a6080';var t=new Date(w.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});var app=(w.app||w.win||w.title||'').slice(0,60);return '<div style=display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,.02);border-left:3px solid'+col+'><span style=font-size:9px;font-weight:700;color:'+col+';min-width:52px;text-transform:uppercase>'+w.state+'</span><span style=font-size:10px;color:#4a6080;min-width:46px>'+t+'</span>'+(app?'<span style=font-size:11px;color:#c8d8e8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap>'+app+'</span>':'')+'</div>';}).join(''):'<div style=color:#4a6080;font-size:11px;padding:16px;text-align:center>No activity recorded yet today.</div>';}
          var upd=document.getElementById('tl-updated');if(upd)upd.textContent='Updated: '+new Date().toLocaleTimeString()+' | '+tl.length+' windows today';
        }).catch(function(){_tlBusy=false;var upd=document.getElementById('tl-updated');if(upd)upd.textContent='Failed to load.';});
      }
      setInterval(function(){var t=document.getElementById('tab-tl');if(t&&t.style.display!=='none')loadTimeline();},30000);

      // ── Work+ Tab ─────────────────────────────────────────────────────────────
      var _wpLoaded=false;
      var _privacyBreaks=[];
      var _DEFAULT_TOOLS={
        engineering:[
          {name:'Claude',desc:'AI coding assistant. Write, debug and explain code in any language.',url:'https://claude.ai',icon:'&#129302;',badge:'Recommended'},
          {name:'GitHub Copilot',desc:'AI pair programmer in VS Code. Autocompletes code in real time.',url:'https://github.com/features/copilot',icon:'&#128187;',badge:'Popular'},
          {name:'Cursor',desc:'AI-first code editor. Chat with your codebase, generate entire features.',url:'https://cursor.sh',icon:'&#9889;',badge:'Hot'},
          {name:'Perplexity AI',desc:'AI search for researching docs, APIs and technical topics fast.',url:'https://perplexity.ai',icon:'&#128269;',badge:''},
          {name:'v0 by Vercel',desc:'Generate React UI components from plain text descriptions.',url:'https://v0.dev',icon:'&#127912;',badge:''},
          {name:'Pieces for Devs',desc:'AI snippet manager. Save and find code snippets intelligently.',url:'https://pieces.app',icon:'&#129513;',badge:''},
        ],
        sales:[
          {name:'Claude',desc:'Write outreach emails, summarize calls, and craft follow-up messages.',url:'https://claude.ai',icon:'&#129302;',badge:'Recommended'},
          {name:'Apollo.io',desc:'AI prospecting — find leads and write personalized outreach.',url:'https://apollo.io',icon:'&#127919;',badge:'Popular'},
          {name:'Lavender',desc:'AI email coach. Scores your cold emails and suggests improvements.',url:'https://lavender.ai',icon:'&#9993;',badge:'Hot'},
          {name:'Gong AI',desc:'Records and analyzes sales calls. Shows what top reps do differently.',url:'https://gong.io',icon:'&#128222;',badge:''},
          {name:'Notion AI',desc:'AI writing inside Notion. Summarize notes and draft proposals fast.',url:'https://notion.so',icon:'&#128221;',badge:''},
          {name:'ChatGPT',desc:'General AI for brainstorming, writing and research tasks.',url:'https://chatgpt.com',icon:'&#128172;',badge:''},
        ],
        operations:[
          {name:'Claude',desc:'Analyze data, summarize reports and automate documentation.',url:'https://claude.ai',icon:'&#129302;',badge:'Recommended'},
          {name:'Notion AI',desc:'AI writing in your workspace. Summarize meeting notes instantly.',url:'https://notion.so',icon:'&#128221;',badge:'Popular'},
          {name:'Make',desc:'AI-enhanced automation. Connect apps and automate workflows.',url:'https://make.com',icon:'&#9881;',badge:''},
          {name:'ChatGPT',desc:'Draft SOPs, process docs and operational reports with AI.',url:'https://chatgpt.com',icon:'&#128172;',badge:''},
          {name:'Gamma',desc:'AI presentation maker. Turn bullet points into polished slides.',url:'https://gamma.app',icon:'&#128202;',badge:'Hot'},
          {name:'Otter.ai',desc:'AI meeting transcription. Automatic notes and action items.',url:'https://otter.ai',icon:'&#127908;',badge:''},
        ],
        support:[
          {name:'Claude',desc:'Draft support responses and explain technical issues clearly.',url:'https://claude.ai',icon:'&#129302;',badge:'Recommended'},
          {name:'Intercom Fin',desc:'AI agent that resolves support tickets automatically.',url:'https://intercom.com',icon:'&#127911;',badge:'Popular'},
          {name:'Notion AI',desc:'Build and maintain your knowledge base with AI writing.',url:'https://notion.so',icon:'&#128221;',badge:''},
          {name:'Otter.ai',desc:'Transcribe support calls automatically. Never miss action items.',url:'https://otter.ai',icon:'&#127908;',badge:''},
          {name:'ChatGPT',desc:'Research answers to complex customer questions quickly.',url:'https://chatgpt.com',icon:'&#128172;',badge:''},
          {name:'Grammarly',desc:'AI writing assistant. Make every reply clear and professional.',url:'https://grammarly.com',icon:'&#9999;',badge:''},
        ],
        executive:[
          {name:'Claude',desc:'Strategic analysis, document drafting and executive briefings.',url:'https://claude.ai',icon:'&#129302;',badge:'Recommended'},
          {name:'Perplexity AI',desc:'AI research engine. Get sourced answers to complex questions.',url:'https://perplexity.ai',icon:'&#128269;',badge:'Popular'},
          {name:'Gamma',desc:'AI presentations. Create board decks from bullet points.',url:'https://gamma.app',icon:'&#128202;',badge:'Hot'},
          {name:'Otter.ai',desc:'AI meeting notes. Capture decisions and action items.',url:'https://otter.ai',icon:'&#127908;',badge:''},
          {name:'ChatGPT',desc:'General AI for research, writing and strategic thinking.',url:'https://chatgpt.com',icon:'&#128172;',badge:''},
          {name:'Notion AI',desc:'AI workspace for managing projects, docs and team updates.',url:'https://notion.so',icon:'&#128221;',badge:''},
        ]
      };
      function loadWorkPlus(){
        // Load dept and tools
        fetch('/api/emp-self').then(function(r){return r.json();}).then(function(d){
          var dept=(d.dept||'engineering').toLowerCase();
          var deptNames={engineering:'Engineering',sales:'Sales',operations:'Operations',support:'Support',executive:'Executive',marketing:'Marketing'};
          var badge=document.getElementById('wp-dept-badge');
          if(badge)badge.textContent=(deptNames[dept]||dept)+' Department Tools';
          // Fetch tools from server (boss-managed)
          fetch('/api/tools?dept='+encodeURIComponent(dept)).then(function(r){return r.json();}).then(function(td){
            var tools=td.tools||[];
            var grid=document.getElementById('wp-tools-grid');
            if(!grid)return;
            if(!tools.length){grid.innerHTML='<div style=color:#4a6080;padding:20px;text-align:center>No tools configured yet. Ask your manager to add tools for your department.</div>';return;}
            grid.innerHTML='';
            tools.forEach(function(t){
            var card=document.createElement('div');
            card.style.cssText='background:#0d1117;border:1px solid #1a2332;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:10px';
            card.onmouseover=function(){this.style.borderColor='#00e676';};
            card.onmouseout=function(){this.style.borderColor='#1a2332';};
            var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px';
            var ico=document.createElement('span');ico.style.fontSize='22px';ico.innerHTML=t.icon;
            var nw=document.createElement('div');nw.style.flex='1';
            var ne=document.createElement('div');ne.style.cssText='font-size:13px;font-weight:700;color:#fff';ne.textContent=t.name;
            if(t.badge){var b=document.createElement('span');b.style.cssText='font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:#0d2a1a;color:#00e676;border:1px solid #1a4a2a;margin-left:6px';b.textContent=t.badge;ne.appendChild(b);}
            nw.appendChild(ne);row.appendChild(ico);row.appendChild(nw);
            var desc=document.createElement('div');desc.style.cssText='font-size:11px;color:#4a6080;line-height:1.6;flex:1';desc.textContent=t.desc;
            var btn=document.createElement('a');btn.href=t.url;btn.target='_blank';
            btn.style.cssText='display:flex;align-items:center;justify-content:center;padding:7px;border-radius:8px;font-size:11px;font-weight:700;background:#0d2a1a;color:#00e676;border:1px solid #1a4a2a;text-decoration:none';
            btn.innerHTML='Open &#8599;';
            btn.onmouseover=function(){this.style.background='#112a1a';};
            btn.onmouseout=function(){this.style.background='#0d2a1a';};
            card.appendChild(row);card.appendChild(desc);card.appendChild(btn);
              grid.appendChild(card);
            });
          }).catch(function(){grid.innerHTML='<div style=color:#4a6080;padding:20px;text-align:center>Could not load tools. Check connection.</div>';});
        }).catch(function(){});
        // Load privacy break log
        var log=document.getElementById('wp-privacy-log');
        if(log&&_privacyBreaks.length){
          log.innerHTML=_privacyBreaks.map(function(b){
            return '<div style=display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a2332><span style=color:#ccd6f0>Privacy Break</span><span style=color:#4a6080>'+b.start+' &mdash; '+(b.end||'ongoing')+'</span></div>';
          }).join('');
        }
      }

      // Track privacy breaks
      var _pbStart=null;
      var _origTogglePrivacy=typeof togglePrivacyEmp==='function'?togglePrivacyEmp:null;

      // Wire up header and FAB buttons after DOM ready
      (function(){
        var ppb = document.getElementById('pp-badge');
        if(ppb) ppb.onclick = showPrivacyPolicyEmp;
        var dwb = document.getElementById('deep-work-btn');
        if(dwb) dwb.onclick = toggleDeepWorkEmp;
        var pvb = document.getElementById('privacy-toggle-btn');
        if(pvb) pvb.onclick = togglePrivacyEmp;
        var reb = document.getElementById('req-ethics-btn');
        if(reb) reb.onclick = requestEthicsReport;
      })();

    </script>
    </body></html>`;
  }

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    function json(code, data) { res.writeHead(code,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }

    if (url === '/api/ping') return json(200, { ok: true, ts: new Date().toISOString() });

    // ── Proxy routes → forward to boss ──────────────────────────────────────────
    // These allow the employee dashboard JS to call local /api/* which gets
    // forwarded to the boss PC so alerts/kill/sysmetrics work correctly.
    const PROXY_ROUTES = ['/api/create-alert', '/api/kill-process', '/api/sysmetrics', '/api/privacy-mode', '/api/messages'];
    if (PROXY_ROUTES.includes(url)) {
      const boss = _parentIp;
      if (!boss) {
        log('PROXY', 'No boss IP — not connected');
        return json(503, { ok: false, error: 'Not connected to boss' });
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const payload = String(body || '');
          const payloadBuf = Buffer.from(payload, 'utf8');
          const opts = {
            hostname: boss, port: C.DASHBOARD_PORT,
            path: url, method: req.method, timeout: 10000,
            headers: { 'Content-Type': 'application/json', 'Content-Length': payloadBuf.length },
          };
          log('PROXY', req.method + ' ' + url + ' -> ' + boss + ' body=' + payload.slice(0,80));
          const pr = http.request(opts, br => {
            let bd = '';
            br.on('data', c => bd += c);
            br.on('end', () => {
              log('PROXY', url + ' boss responded ' + br.statusCode);
              try { res.writeHead(br.statusCode, { 'Content-Type': 'application/json' }); res.end(bd); } catch(_) {}
            });
          });
          pr.on('error', err => {
            log('PROXY', 'Error: ' + err.message);
            try { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: err.message })); } catch(_) {}
          });
          pr.on('timeout', () => {
            log('PROXY', url + ' timeout');
            pr.destroy();
            try { res.writeHead(504, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'timeout' })); } catch(_) {}
          });
          if (payloadBuf.length) pr.write(payloadBuf);
          pr.end();
        } catch(err) {
          log('PROXY', 'Caught: ' + err.message);
          try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: err.message })); } catch(_) {}
        }
      });
      return;
    }

    if (url === '/api/emp-timeline') {
      const now2 = new Date();
      const s2 = new Date(now2); s2.setHours(0, 0, 0, 0);
      const e2 = new Date(now2); e2.setHours(23, 59, 59, 999);
      const tl2 = store.getTimelineSince(s2.toISOString());
      const ds2 = act.daySummary(s2.toISOString(), e2.toISOString());
      return json(200, { timeline: tl2, summary: ds2, hostname: os.hostname() });
    }

    if (url === '/api/emp-self') {
      const now = new Date();
      const s = new Date(now); s.setHours(C.SHIFT_START_H || 8, 0, 0, 0);
      const e = new Date(now); e.setHours(C.SHIFT_END_H || 20, 0, 0, 0);
      const cur = act.getCurrentState();
      const summary = act.daySummary(s.toISOString(), e.toISOString());
      return json(200, { hostname: os.hostname(), state: cur.state, summary, connected: !!_parentIp });
    }

    // All pages → employee dashboard
    const now = new Date();
    const s = new Date(now); s.setHours(C.SHIFT_START_H || 8, 0, 0, 0);
    const e = new Date(now); e.setHours(C.SHIFT_END_H || 20, 0, 0, 0);
    const cur = act.getCurrentState();
    const summary = act.daySummary(s.toISOString(), e.toISOString());
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(buildDashboardHtml(summary, cur.state, !!_parentIp));
  });

  server.listen(C.DASHBOARD_PORT, '0.0.0.0', () => {
    log('CHILD', `Employee dashboard running on port ${C.DASHBOARD_PORT}`);
  });
}

// ── Start ──────────────────────────────────────────────────────────────────────
function start() {
  log('CHILD', `=== CHILD v13.0 on ${os.hostname()} ===`);

  if (process.argv.includes('--signoff')) {
    act.init(null);
    sendLifecycleAlert('signoff');
    setTimeout(() => process.exit(0), 4000);
    return;
  }

  act.init(onBlockedSite);
  registerShutdownHooks();
  startNetworkMonitor();
  startLocalDashboard();
  reconnect();
}

module.exports = { start };
