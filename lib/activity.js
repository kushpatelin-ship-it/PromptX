'use strict';
/**
 * Prompt AI Work+ v12 — Activity + Anti-Spoof + Site Monitor
 * ═══════════════════════════════════════════════════════════
 * NEW in v12:
 *   - Browser tab title + URL scanning for adult/gambling/blocked sites
 *   - Reads browser history from Chrome, Edge, Firefox (Windows only)
 *   - Fires alert immediately when blocked site detected
 *   - 8-detector anti-spoof engine retained
 */

const { execSync } = require('child_process');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const { log }      = require('./logger');
const C            = require('./constants');
const fs_dept      = require('fs');

// ── Load department profile ───────────────────────────────────────────────────
let _dept = null;
function _loadDept() {
  try {
    if (fs_dept.existsSync(C.DEPT_FILE)) {
      const d = JSON.parse(fs_dept.readFileSync(C.DEPT_FILE, 'utf8'));
      _dept = C.DEPARTMENTS[d.dept] || null;
      if (_dept) log('DEPT', 'Profile: ' + _dept.name);
    }
  } catch(_) {}
}
_loadDept();

// ── Smart productivity score based on active window + department ─────────────
function _smartProdScore(state, activeWin) {
  if (state === 'locked' || state === 'sleeping') return 0;
  if (state === 'spoofed') return 0;
  if (state === 'away') {
    // Check if a call app is open (on call = not really away)
    if (_dept && activeWin) {
      const w = activeWin.toLowerCase();
      const onCall = _dept.call_apps.some(a => w.includes(a));
      if (onCall) return 60; // on call = partially productive
    }
    return 0;
  }
  if (state === 'passive') return 50; // Passive research = half productive
  if (state === 'idle') return 15;
  if (state !== 'active') return 0;

  // Active state: score by app if dept profile loaded
  if (_dept && activeWin) {
    const w = activeWin.toLowerCase();
    const apps = _dept.productive_apps;
    let bestScore = -1;
    for (const [app, score] of Object.entries(apps)) {
      if (w.includes(app.toLowerCase())) {
        if (score > bestScore) bestScore = score;
      }
    }
    if (bestScore >= 0) return bestScore;
    return 55; // unknown app while active = neutral
  }
  return 100; // no dept profile = default active=100
}
const TL_FILE      = path.join(C.DATA_DIR, 'boss-timeline.json');
const CTR_FILE     = path.join(C.DATA_DIR, 'boss-counters.json');
const CAM_DIR      = path.join(C.DATA_DIR, 'away-captures');

// ── Webcam capture on away event ──────────────────────────────────────────────
let _lastCamSnap = null; // base64 jpeg of last away capture
let _lastCamTs   = null;
let _camCapturing = false;

function _captureWebcam() {
  if (_camCapturing) return;
  _camCapturing = true;
  try {
    fs.mkdirSync(CAM_DIR, { recursive: true });
    const outFile = path.join(CAM_DIR, 'away_' + Date.now() + '.jpg');
    const cp = require('child_process');

    // Method 1: ffmpeg (fast, silent)
    cp.exec('ffmpeg -y -f dshow -i video="HP 2.0MP High Definition Webcam" -vframes 1 -q:v 2 "' + outFile + '" 2>nul',
      {timeout:8000, windowsHide:true}, (err1) => {
      if (!err1 && fs.existsSync(outFile)) {
        return _onCamFile(outFile);
      }
      // Method 2: avicap32 via inline C# PowerShell
      const outFwd = outFile.replace(/\\/g, '/');
      const cs = [
        'Add-Type -TypeDefinition @"',
        'using System;using System.Drawing;using System.Drawing.Imaging;using System.Runtime.InteropServices;',
        'public class CC{',
        '  [DllImport("avicap32.dll")] public static extern IntPtr capCreateCaptureWindowA(string n,int f,int x,int y,int w,int h,IntPtr p,int i);',
        '  [DllImport("user32.dll")] public static extern bool SendMessage(IntPtr h,int m,int w,int l);',
        '  public const int WS=0x40000000,WM_CAP=0x400,CON=WM_CAP+10,DIS=WM_CAP+11,CPY=WM_CAP+30,GRAB=WM_CAP+60;',
        '}',
        '"@ -ReferencedAssemblies System.Drawing',
        '$h=[CC]::capCreateCaptureWindowA("cam",[CC]::WS,0,0,640,480,[IntPtr]::Zero,0)',
        '[CC]::SendMessage($h,[CC]::CON,0,0)|Out-Null',
        'Start-Sleep -Milliseconds 1000',
        '[CC]::SendMessage($h,[CC]::GRAB,0,0)|Out-Null',
        '[CC]::SendMessage($h,[CC]::CPY,0,0)|Out-Null',
        'Add-Type -AssemblyName System.Windows.Forms',
        '$img=[System.Windows.Forms.Clipboard]::GetImage()',
        'if($img){$img.Save("' + outFwd + '");Write-Host "OK"}',
        '[CC]::SendMessage($h,[CC]::DIS,0,0)|Out-Null',
      ].join('\n');
      cp.execFile('powershell.exe',
        ['-NonInteractive','-WindowStyle','Hidden','-Command', cs],
        {timeout:12000},
        (err2, stdout) => {
          if (fs.existsSync(outFile)) {
            _onCamFile(outFile);
          } else {
            log('CAM', 'All capture methods failed. err1=' + (err1&&err1.code) + ' err2=' + (err2&&err2.message));
            _camCapturing = false;
          }
        });
    });
    return;
  } catch(e) {
    log('CAM', 'Capture error: ' + e.message);
    _camCapturing = false;
  }
}

function _onCamFile(outFile) {
  try {
    const data = fs.readFileSync(outFile);
    _lastCamSnap = 'data:image/jpeg;base64,' + data.toString('base64');
    _lastCamTs   = new Date().toISOString();
    log('CAM', 'Capture saved: ' + path.basename(outFile));
    const files = fs.readdirSync(CAM_DIR).filter(f=>f.endsWith('.jpg')).sort();
    while (files.length > 10) { try { fs.unlinkSync(path.join(CAM_DIR, files.shift())); } catch(_){} }
  } catch(e) { log('CAM', 'Read error: ' + e.message); }
  _camCapturing = false;
}
function getLastCamSnap() { return { img: _lastCamSnap, ts: _lastCamTs }; }

// ── Runtime ───────────────────────────────────────────────────────────────────
let _hook          = null;
let _avail         = false;
let _lastInput     = Date.now();
let _win           = _blank();
let _movesWin      = 0;

const BUF = 120;
let _kTs=[], _kCode=[], _mTs=[], _mDx=[], _mDy=[], _lastMPos=null;
let _tl = [];

let _currentState  = 'unknown';
let _stateStart    = Date.now();
const _stateLog    = [];

let _activeWin     = '';
let _lastActiveWin = '';  // track window changes for reading detection
let _screenLocked  = false;
let _unlockTime    = 0;  // timestamp of last unlock for grace period
let _isSleeping    = false;
let _processList   = [];
let _loginTime     = null;
let _winTimer      = null;

// Site monitoring
let _blockedSiteAlerts = [];   // fired this session — deduplicate
let _onBlockedSite     = null; // callback → (hostname, site, category, title)
let _lastUrls          = new Set();

const _alertsFired = new Set();

// ── Init ──────────────────────────────────────────────────────────────────────
function init(onBlockedSite) {
  _onBlockedSite = onBlockedSite || null;
  // Load persisted counters (lock count etc) for today
  try {
    if (fs.existsSync(CTR_FILE)) {
      const d = JSON.parse(fs.readFileSync(CTR_FILE, 'utf8'));
      const today = new Date().toDateString();
      if (d.date === today) {
        _lockCount = d.lock_count || 0;
        _idleCount = d.idle_count || 0;
        _awayCount = d.away_count || 0;
        if (d.first_activity) _firstActivity = d.first_activity;
        log('ACTIVITY', 'Restored counters — locks:' + _lockCount + ' idle:' + _idleCount + ' away:' + _awayCount);
      }
    }
  } catch(e) { log('ACTIVITY', 'Counter load error: ' + e.message); }

  // Load persisted timeline so shift data survives restarts
  try {
    if (fs.existsSync(TL_FILE)) {
      const d = JSON.parse(fs.readFileSync(TL_FILE, 'utf8'));
      const cutoff = Date.now() - 48 * 3600 * 1000;
      _tl = (d.windows || []).filter(w => new Date(w.ts).getTime() > cutoff);
      log('ACTIVITY', 'Loaded ' + _tl.length + ' timeline windows from disk');
    }
  } catch(e) { log('ACTIVITY', 'Timeline load error: ' + e.message); }
  _pollSystem();
  _pollBrowserUrls();
  // Save timeline to disk every 60s instead of every snapshot
  setInterval(function() {
    try {
      fs.mkdirSync(C.DATA_DIR, { recursive: true });
      fs.writeFileSync(TL_FILE, JSON.stringify({ updated: new Date().toISOString(), windows: _tl }));
    } catch(e) {}
  }, 60000);

  try {
    const { uIOhook } = require('uiohook-napi');
    _hook = uIOhook;
    _hook.on('keydown', e => {
      const _sinceUnlock = Date.now() - _unlockTime;
      if (_screenLocked && _sinceUnlock > 2000) log('SPOOF','Key while locked');
      const t=Date.now(); _lastInput=t; _win.keys++;
      _push(_kTs,t,BUF); _push(_kCode,e.keycode,BUF);
    });
    _hook.on('keyup',     () => { _lastInput=Date.now(); });
    _hook.on('mousedown', () => { _lastInput=Date.now(); _win.clicks++; });
    _hook.on('mouseup',   () => { _lastInput=Date.now(); });
    _hook.on('mousemove', e  => {
      const t=Date.now(); _lastInput=t; _win.moves++; _movesWin++;
      _push(_mTs,t,BUF);
      if(_lastMPos){ _push(_mDx,e.x-_lastMPos.x,BUF); _push(_mDy,e.y-_lastMPos.y,BUF); }
      _lastMPos={x:e.x,y:e.y};
    });
    _hook.on('wheel', () => { _lastInput=Date.now(); _win.scrolls++; });
    _hook.start();
    _avail = true;
    log('ACTIVITY','Input monitoring active');
  } catch(e) {
    _avail = false;
    log('ACTIVITY','uiohook unavailable — run npm install');
  }
}

// ── Browser URL/title scanner ──────────────────────────────────────────────────
function _pollBrowserUrls() {
  if (process.platform !== 'win32') return;

  // Read open browser tab titles via window titles (works without browser extension)
  // Also reads Chrome/Edge history DB for recently visited URLs
  function scanTitles() {
    try {
      const ps = `powershell -NoProfile -NonInteractive -Command "
        Get-Process | Where-Object {$_.MainWindowTitle -ne '' -and ($_.Name -match 'chrome|msedge|firefox|opera|brave')} |
        Select-Object -ExpandProperty MainWindowTitle" 2>$null`;
      const out = execSync(ps, { timeout:2000, stdio:['ignore','pipe','ignore'] }).toString();
      const titles = out.split('\n').map(t=>t.trim()).filter(Boolean);
      titles.forEach(title => _checkTitle(title));
    } catch(_) {}
  }

  // Read Chrome/Edge history (SQLite — copy first since browser locks it)
  function scanHistory() {
    const profiles = [
      path.join(os.homedir(), 'AppData','Local','Google','Chrome','User Data','Default','History'),
      path.join(os.homedir(), 'AppData','Local','Microsoft','Edge','User Data','Default','History'),
      path.join(os.homedir(), 'AppData','Roaming','Mozilla','Firefox','Profiles'),
    ];

    profiles.forEach(p => {
      if (!fs.existsSync(p)) return;
      try {
        // Copy history file (browser keeps it locked)
        const tmp = path.join(os.tmpdir(), 'pai_hist_'+Date.now()+'.db');
        fs.copyFileSync(p, tmp);

        // Read using PowerShell SQLite query
        const ps = `powershell -NoProfile -NonInteractive -Command "
          Add-Type -Path '$env:TEMP\\System.Data.SQLite.dll' -EA SilentlyContinue
          try {
            $c=[System.Data.SQLite.SQLiteConnection]::new('Data Source=${tmp}')
            $c.Open()
            $cmd=$c.CreateCommand()
            $cmd.CommandText='SELECT url,title FROM urls ORDER BY last_visit_time DESC LIMIT 20'
            $r=$cmd.ExecuteReader()
            while($r.Read()){ Write-Output ($r[0]+'|||'+$r[1]) }
            $c.Close()
          } catch {}
          Remove-Item '${tmp}' -Force -EA SilentlyContinue" 2>$null`;

        try {
          const rows = execSync(ps, { timeout:3000, stdio:['ignore','pipe','ignore'] }).toString();
          rows.split('\n').forEach(row => {
            const [url, title] = row.split('|||');
            if (url && !_lastUrls.has(url.trim())) {
              _lastUrls.add(url.trim());
              if (_lastUrls.size > 500) {
                const first = _lastUrls.values().next().value;
                _lastUrls.delete(first);
              }
              _checkUrl(url.trim(), title?.trim() || '');
            }
          });
        } catch(_) {}

        try { fs.unlinkSync(tmp); } catch(_) {}
      } catch(_) {}
    });
  }

  // Primary: scan window titles every 5s (reliable, no DB needed)
  setInterval(scanTitles, 5000);
  scanTitles();

  // Secondary: scan history every 2 min (catches background tabs)
  setInterval(scanHistory, 120_000);
}

// ── Check title/URL against blocked categories ─────────────────────────────────
// ── Department-aware site whitelist ──────────────────────────────────────────
function _isWhitelisted(text) {
  const t = text.toLowerCase();
  // Always allowed sites (global)
  if (C.ALWAYS_ALLOWED && C.ALWAYS_ALLOWED.some(a => t.includes(a.toLowerCase()))) return true;
  // Dept productive apps whitelist
  if (!_dept) return false;
  return Object.keys(_dept.productive_apps).some(app => t.includes(app.toLowerCase()));
}

// ── Department-specific extra blocked sites ───────────────────────────────────
const DEPT_BLOCKED = {
  engineering: ['facebook.com','instagram.com','tiktok.com','netflix.com','twitch.tv','onlyfans'],
  sales:       ['netflix.com','tiktok.com','twitch.tv','onlyfans','pornhub'],
  operations:  ['netflix.com','tiktok.com','twitch.tv','onlyfans'],
  support:     ['netflix.com','tiktok.com','twitch.tv','onlyfans','youtube.com/watch'],
  executive:   ['tiktok.com','onlyfans','twitch.tv'],
};

function _checkTitle(title) {
  const t = title.toLowerCase();
  // Skip if whitelisted by dept profile
  if (_isWhitelisted(t)) return;
  // Check global blocked categories
  for (const [cat, keywords] of Object.entries(C.BLOCKED_CATEGORIES)) {
    if (!keywords.length) continue;
    const hit = keywords.find(kw => t.includes(kw));
    if (hit) { _fireSiteAlert(cat, title, hit, ''); return; }
  }
  // Check dept-specific blocked sites
  if (_dept) {
    const deptBlocked = DEPT_BLOCKED[Object.keys(C.DEPARTMENTS).find(k => C.DEPARTMENTS[k] === _dept)] || [];
    const hit = deptBlocked.find(kw => t.includes(kw));
    if (hit) { _fireSiteAlert('unproductive', title, hit, ''); return; }
  }
}

function _checkUrl(url, title) {
  const combined = (url + ' ' + title).toLowerCase();
  // Skip if whitelisted by dept profile
  if (_isWhitelisted(combined)) return;
  // Check global blocked categories
  for (const [cat, keywords] of Object.entries(C.BLOCKED_CATEGORIES)) {
    if (!keywords.length) continue;
    const hit = keywords.find(kw => combined.includes(kw));
    if (hit) { _fireSiteAlert(cat, title||url, hit, url); return; }
  }
  // Check dept-specific blocked sites
  if (_dept) {
    const deptKey = Object.keys(C.DEPARTMENTS).find(k => C.DEPARTMENTS[k] === _dept);
    const deptBlocked = DEPT_BLOCKED[deptKey] || [];
    const hit = deptBlocked.find(kw => combined.includes(kw));
    if (hit) { _fireSiteAlert('unproductive', title||url, hit, url); return; }
  }
}

function _fireSiteAlert(category, title, keyword, url) {
  // Deduplicate — same site + same hour
  const key = `site_${category}_${keyword}_${new Date().getHours()}`;
  if (_blockedSiteAlerts.includes(key)) return;
  _blockedSiteAlerts.push(key);
  if (_blockedSiteAlerts.length > 100) _blockedSiteAlerts.shift();

  const displayUrl = url ? url.replace(/^https?:\/\//,'').split('/')[0] : keyword;
  log('BLOCKED', `${category} site: "${title}" keyword="${keyword}"`);

  if (_onBlockedSite) {
    _onBlockedSite({
      category,
      title   : title.slice(0, 80),
      keyword,
      url     : displayUrl,
      ts      : new Date().toISOString(),
    });
  }
}

// ── Snapshot ──────────────────────────────────────────────────────────────────
function snapshot() {
  const now    = Date.now();
  // Sub-second idle precision using high-res timer
  const _idleMs = now - _lastInput;
  const idle_s = _idleMs / 1000; // Keep as float for precision
  const idle_s_display = Math.round(idle_s); // For display/reporting
  const win    = { ..._win };
  const mps    = _movesWin;
  _win = _blank(); _movesWin = 0;

  // Detect reading: scrolling or window title changed = engaged
  const _isReading = (win.scrolls > 0) || (_activeWin && _activeWin !== _lastActiveWin);
  _lastActiveWin = _activeWin;
  let newState = 'active';
  if      (!_avail)             newState = 'unknown';
  else if (_isSleeping)         newState = 'sleeping';
  else if (_screenLocked)       newState = 'locked';
  else if (idle_s >= C.AWAY_S)  newState = 'away'; // uses float idle_s for precision
  // Reading (scroll/window change) extends idle threshold to 3x
  else if (_isReading && idle_s < C.AWAY_S) newState = 'active';
  else if (idle_s >= C.IDLE_S || win.keys+win.clicks+win.moves+win.scrolls===0) newState = 'idle';

  // ── Passive research detection ────────────────────────────────────────
  // If idle/away but a video/meeting/research app is in foreground → passive
  if (newState === 'idle' || newState === 'away') {
    const _passiveApps = ['zoom','teams','meet','webex','skype','youtube','twitch',
                          'netflix','spotify','vlc','plex','obs','stream','video',
                          'training','learn','udemy','coursera','pluralsight'];
    const _win_lower = _activeWin.toLowerCase();
    const _isPassive = _passiveApps.some(a => _win_lower.includes(a));
    if (_isPassive) {
      newState = 'passive';
      log('ACTIVITY', 'Passive research detected: ' + _activeWin.slice(0,40));
    }
  }
  const { score, reasons } = (newState==='active') ? _spoof(win,mps) : {score:0,reasons:[]};
  if (score >= C.SPOOF_FLAG && newState==='active') newState = 'spoofed';

  const stateChanged = (newState !== _currentState);
  if (stateChanged) {
    const durMin = Math.round((now - _stateStart) / 60000);
    if (_currentState !== 'unknown')
      _stateLog.push({ state:_currentState, from:new Date(_stateStart).toISOString(), to:new Date(now).toISOString(), durationMin:durMin });
    _currentState = newState;
    _stateStart   = now;
  }

  const prod = _smartProdScore(newState, _activeWin);
  const entry = {
    ts:new Date().toISOString(), state:newState, stateChanged,
    keys:win.keys, clicks:win.clicks, moves:win.moves, scrolls:win.scrolls,
    idle_s:idle_s_display, idle_ms:Math.round(_idleMs), active_win:_activeWin,
    screen_locked:_screenLocked, is_sleeping:_isSleeping,
    processes:_processList.slice(0,12), login_time:_loginTime,
    spoof_score:score, spoof_reasons:reasons, prod_score:prod,
  };
  // Track idle/away transitions
  const _nowIdle = (newState === 'idle');
  const _nowAway = (newState === 'away');
  let _ctrChanged = false;
  if (_nowIdle && !_lastIdleState) { _idleCount++; _ctrChanged = true; }
  if (_nowAway && !_lastAwayState) { _awayCount++; _ctrChanged = true; }
  _lastIdleState = _nowIdle;
  _lastAwayState = _nowAway;
  if (_ctrChanged) { _saveCounters(); }
  _tl.push(entry);
  if (_tl.length > C.MAX_TL) _tl.shift();
  // Invalidate daySummary cache when new window added
  _daySumCacheLen = -1;
  return entry;
}

// ── Alert checks ──────────────────────────────────────────────────────────────
function checkAlerts() {
  const alerts = [];
  const now    = Date.now();

  if (_currentState==='away') {
    const m = Math.round((now-_stateStart)/60000);
    const key = `away_${Math.floor(m/30)}`;
    if (m >= C.ALERT_AWAY_MIN && !_alertsFired.has(key)) {
      _alertsFired.add(key);
      alerts.push({type:'away', message:`Away for ${m} minutes`, severity:'warning', ts:new Date().toISOString()});
    }
  }
  if (_currentState==='locked') {
    const m = Math.round((now-_stateStart)/60000);
    const key = `locked_${Math.floor(m/60)}`;
    if (m >= C.ALERT_LOCKED_MIN && !_alertsFired.has(key)) {
      _alertsFired.add(key);
      alerts.push({type:'locked', message:`Screen locked for ${m} minutes`, severity:'warning', ts:new Date().toISOString()});
    }
  }
  if (new Date().getHours()>=12 && !_alertsFired.has('prod_midday')) {
    const ds = daySummary(_shiftStart(), _shiftEnd());
    if (ds && ds.total_minutes>=60 && ds.productive_pct < C.ALERT_PROD_PCT) {
      _alertsFired.add('prod_midday');
      alerts.push({type:'productivity', message:`Only ${ds.productive_pct}% productive by midday`, severity:'warning', ts:new Date().toISOString()});
    }
  }
  return alerts;
}

// ── Day summary — cached, only recomputes when timeline grows ────────────────
let _daySumCache = null;
let _daySumCacheLen = -1;
let _daySumCacheKey = '';

function daySummary(from, to) {
  const key = from + '|' + to;
  // Return cache if timeline hasn't changed and same time window
  if (_daySumCache && _daySumCacheLen === _tl.length && _daySumCacheKey === key) {
    return _daySumCache;
  }
  _daySumCacheKey = key;
  _daySumCacheLen = _tl.length;
  _daySumCache = _daySummaryCompute(from, to);
  return _daySumCache;
}

function _daySummaryCompute(from, to) {
  const f=new Date(from).getTime(), t=new Date(to).getTime();
  // Pre-convert all timestamps once to avoid repeated new Date() in loops
  const wins=_tl.filter(w=>{const x=new Date(w.ts).getTime(); return x>=f&&x<=t;});
  if(!wins.length) return null;
  // Pre-parse timestamps for wins to avoid repeated new Date(w.ts) calls below
  const winTs = wins.map(w => new Date(w.ts).getTime());
  if (!wins.length) return null;

  const counts={active:0,idle:0,away:0,locked:0,sleeping:0,spoofed:0,unknown:0,passive:0};
  wins.forEach(w=>counts[w.state]=(counts[w.state]||0)+1);
  const prodPct=Math.round(wins.reduce((s,w)=>s+(w.prod_score||0),0)/wins.length);

  const appMap={};
  wins.filter(w=>w.active_win).forEach(w=>{
    const app=w.active_win.split(/[-|—]/)[0].trim().slice(0,40)||'Unknown';
    appMap[app]=(appMap[app]||0)+1;
  });
  const top_apps=Object.entries(appMap).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([app,n])=>({app,minutes:Math.round(n*C.SAMPLE_MS/60000)}));

  const procMap={};
  wins.forEach(w=>(w.processes||[]).forEach(p=>{procMap[p]=(procMap[p]||0)+1;}));
  const top_processes=Object.entries(procMap).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([name,n])=>({name,minutes:Math.round(n*C.SAMPLE_MS/60000)}));

  const unproductive=[];
  let block=null;
  for (const w of wins) {
    const bad=['idle','away','locked','sleeping','spoofed'].includes(w.state); // passive is NOT unproductive
    if (bad&&!block) block={state:w.state,start:w.ts,end:w.ts};
    else if (bad&&block) block.end=w.ts;
    else if (!bad&&block) {
      const dur=Math.round((new Date(block.end)-new Date(block.start))/60000);
      if (dur>=10) unproductive.push({...block,durationMin:dur});
      block=null;
    }
  }
  if (block) {
    const dur=Math.round((new Date(block.end)-new Date(block.start))/60000);
    if (dur>=10) unproductive.push({...block,durationMin:dur});
  }

  const hourly={};
  wins.forEach(w=>{
    const h=new Date(w.ts).getHours();
    if(!hourly[h]) hourly[h]={active:0,idle:0,away:0,locked:0,sleeping:0,spoofed:0,total:0};
    hourly[h][w.state]=(hourly[h][w.state]||0)+1;
    hourly[h].total++;
    hourly[h].prod=Math.round((hourly[h].active/(hourly[h].total||1))*100);
  });

  const stateChanges=_stateLog
    .filter(s=>new Date(s.from).getTime()>=f&&new Date(s.from).getTime()<=t)
    .slice(-50);

  return {
    date:new Date(from).toLocaleDateString(),
    total_minutes:Math.round(wins.length*C.SAMPLE_MS/60000),
    active_minutes:Math.round(counts.active*C.SAMPLE_MS/60000),
    passive_minutes:Math.round(counts.passive*C.SAMPLE_MS/60000),
    idle_minutes:(function(){var r=(function(){var sessions=0;var mins=0;var inS=false;var sLen=0;wins.forEach(function(w){if(w.state==='idle'&&!inS){inS=true;sLen=1;}else if(w.state==='idle'&&inS){sLen++;}else if(w.state!=='idle'&&inS){if(sLen>=2){sessions++;mins+=sLen;}inS=false;sLen=0;}});if(inS&&sLen>=2){sessions++;mins+=sLen;}return {count:sessions,mins:Math.round(mins*C.SAMPLE_MS/60000)};})();return r.mins;})(),
    away_minutes:(function(){var r=(function(){var sessions=0;var mins=0;var inS=false;var sLen=0;wins.forEach(function(w){if(w.state==='away'&&!inS){inS=true;sLen=1;}else if(w.state==='away'&&inS){sLen++;}else if(w.state!=='away'&&inS){if(sLen>=3){sessions++;mins+=sLen;}inS=false;sLen=0;}});if(inS&&sLen>=3){sessions++;mins+=sLen;}return {count:sessions,mins:Math.round(mins*C.SAMPLE_MS/60000)};})();return r.mins;})(),
    locked_minutes:(function(){var validLocked=0;var inLock=false;var lockLen=0;wins.forEach(function(w){if(w.state==='locked'&&!inLock){inLock=true;lockLen=1;}else if(w.state==='locked'&&inLock){lockLen++;}else if(w.state!=='locked'&&inLock){if(lockLen>=3)validLocked+=lockLen;inLock=false;lockLen=0;}});if(inLock&&lockLen>=3)validLocked+=lockLen;return Math.round(validLocked*C.SAMPLE_MS/60000);})(),
    first_activity:(function(){if(_firstActivity)return _firstActivity;var aw=wins.filter(function(w){return w.state==='active';});return aw.length?aw[0].ts:null;})(),
    lock_count:(function(){var sessions=[];var inLock=false;var lockLen=0;wins.forEach(function(w,i){if(w.state==='locked'&&!inLock){inLock=true;lockLen=1;}else if(w.state==='locked'&&inLock){lockLen++;}else if(w.state!=='locked'&&inLock){if(lockLen>=3)sessions.push(lockLen);inLock=false;lockLen=0;}});if(inLock&&lockLen>=3)sessions.push(lockLen);var tlLocks=sessions.length;if(tlLocks>_lockCount)_lockCount=tlLocks;return _lockCount;})(),
    session_minutes:wins.length?Math.round((new Date()-new Date(wins[0].ts))/60000):0,
    active_sessions:(function(){var sessions=[];var sStart=null;var sEnd=null;var prevLocked=false;wins.forEach(function(w){var locked=(w.state==='locked');if(!locked&&prevLocked){if(sStart)sessions.push({start:sStart,end:sEnd,minutes:Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1)});sStart=w.ts;sEnd=w.ts;}else if(!locked){if(!sStart)sStart=w.ts;sEnd=w.ts;}prevLocked=locked;});if(sStart)sessions.push({start:sStart,end:sEnd,minutes:Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1)});return sessions;})(),
    away_count:(function(){var r=(function(){var sessions=0;var mins=0;var inS=false;var sLen=0;wins.forEach(function(w){if(w.state==='away'&&!inS){inS=true;sLen=1;}else if(w.state==='away'&&inS){sLen++;}else if(w.state!=='away'&&inS){if(sLen>=3){sessions++;mins+=sLen;}inS=false;sLen=0;}});if(inS&&sLen>=3){sessions++;mins+=sLen;}return {count:sessions,mins:Math.round(mins*C.SAMPLE_MS/60000)};})();if(r.count>_awayCount)_awayCount=r.count;return _awayCount;})(),
    idle_count:(function(){var r=(function(){var sessions=0;var mins=0;var inS=false;var sLen=0;wins.forEach(function(w){if(w.state==='idle'&&!inS){inS=true;sLen=1;}else if(w.state==='idle'&&inS){sLen++;}else if(w.state!=='idle'&&inS){if(sLen>=2){sessions++;mins+=sLen;}inS=false;sLen=0;}});if(inS&&sLen>=2){sessions++;mins+=sLen;}return {count:sessions,mins:Math.round(mins*C.SAMPLE_MS/60000)};})();if(r.count>_idleCount)_idleCount=r.count;return _idleCount;})(),
    sleeping_minutes:Math.round(counts.sleeping*C.SAMPLE_MS/60000),
    spoofed_windows:counts.spoofed,
    productive_pct:prodPct,
    lost_time_minutes:(function(){
      var idleM=(function(){var mins=0;var inS=false;var sLen=0;wins.forEach(function(w){if(w.state==='idle'&&!inS){inS=true;sLen=1;}else if(w.state==='idle'&&inS){sLen++;}else if(w.state!=='idle'&&inS){if(sLen>=2)mins+=sLen;inS=false;sLen=0;}});if(inS&&sLen>=2)mins+=sLen;return Math.round(mins*C.SAMPLE_MS/60000);})();
      var awayM=(function(){var mins=0;var inS=false;var sLen=0;wins.forEach(function(w){if(w.state==='away'&&!inS){inS=true;sLen=1;}else if(w.state==='away'&&inS){sLen++;}else if(w.state!=='away'&&inS){if(sLen>=3)mins+=sLen;inS=false;sLen=0;}});if(inS&&sLen>=3)mins+=sLen;return Math.round(mins*C.SAMPLE_MS/60000);})();
      var lockM=(function(){var mins=0;var inL=false;var lLen=0;wins.forEach(function(w){if(w.state==='locked'&&!inL){inL=true;lLen=1;}else if(w.state==='locked'&&inL){lLen++;}else if(w.state!=='locked'&&inL){if(lLen>=3)mins+=lLen;inL=false;lLen=0;}});if(inL&&lLen>=3)mins+=lLen;return Math.round(mins*C.SAMPLE_MS/60000);})();
      return idleM+awayM+lockM;
    })(),
    efficiency_pct:(function(){
      var sessM=wins.length?Math.round((new Date()-new Date(wins[0].ts))/60000):0;
      var actM=Math.round(counts.active*C.SAMPLE_MS/60000);
      var netM=Math.max(0,actM-(Math.round(counts.idle*C.SAMPLE_MS/60000))-(Math.round(counts.away*C.SAMPLE_MS/60000))-(Math.round(counts.locked*C.SAMPLE_MS/60000)));
      return sessM>0?Math.round((netM/sessM)*100):0;
    })(),
    longest_focus_minutes:(function(){
      var sessions=[];var sStart=null;var sEnd=null;var prevLocked=false;
      wins.forEach(function(w){var locked=(w.state==='locked');if(!locked&&prevLocked){if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));sStart=w.ts;sEnd=w.ts;}else if(!locked){if(!sStart)sStart=w.ts;sEnd=w.ts;}prevLocked=locked;});
      if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));
      return sessions.length?Math.max.apply(null,sessions):0;
    })(),
    avg_session_minutes:(function(){
      var sessions=[];var sStart=null;var sEnd=null;var prevLocked=false;
      wins.forEach(function(w){var locked=(w.state==='locked');if(!locked&&prevLocked){if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));sStart=w.ts;sEnd=w.ts;}else if(!locked){if(!sStart)sStart=w.ts;sEnd=w.ts;}prevLocked=locked;});
      if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));
      return sessions.length?Math.round(sessions.reduce(function(a,b){return a+b;},0)/sessions.length):0;
    })(),
    peak_hour:(function(){
      var hMap={};
      wins.filter(function(w){return w.state==='active';}).forEach(function(w){var h=new Date(w.ts).getHours();hMap[h]=(hMap[h]||0)+1;});
      var best=null;var bestN=0;
      Object.keys(hMap).forEach(function(h){if(hMap[h]>bestN){bestN=hMap[h];best=parseInt(h);}});
      if(best===null)return null;
      var ampm=best>=12?(best===12?12:best-12)+' PM':( best===0?12:best)+' AM';
      return ampm;
    })(),
    focus_score:(function(){
      var sessM=wins.length?Math.round((new Date()-new Date(wins[0].ts))/60000):0;
      var sessions=[];var sStart=null;var sEnd=null;var prevLocked=false;
      wins.forEach(function(w){var locked=(w.state==='locked');if(!locked&&prevLocked){if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));sStart=w.ts;sEnd=w.ts;}else if(!locked){if(!sStart)sStart=w.ts;sEnd=w.ts;}prevLocked=locked;});
      if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));
      var longestM=sessions.length?Math.max.apply(null,sessions):0;
      var focusRatio=sessM>0?longestM/sessM:0;
      return Math.min(100,Math.round(focusRatio*prodPct));
    })(),
    flags:(function(){
      var flags=[];
      var fa=wins.filter(function(w){return w.state==='active';});
      if(fa.length){
        var firstHour=new Date(fa[0].ts).getHours();
        var lastHour=new Date(fa[fa.length-1].ts).getHours();
        var firstMin=new Date(fa[0].ts).getMinutes();
        if(firstHour>9||(firstHour===9&&firstMin>30))flags.push({type:'late_start',label:'Late Start',detail:'First activity after 9:30 AM',severity:'warn'});
        if(lastHour<16||(lastHour===16&&new Date(fa[fa.length-1].ts).getMinutes()<30))flags.push({type:'early_quit',label:'Early Finish',detail:'Last activity before 4:30 PM',severity:'warn'});
        if(lastHour>=18)flags.push({type:'after_hours',label:'After Hours',detail:'Activity detected after 6 PM',severity:'info'});
      }
      var sessions=[];var sStart=null;var sEnd=null;var prevLocked=false;
      wins.forEach(function(w){var locked=(w.state==='locked');if(!locked&&prevLocked){if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));sStart=w.ts;sEnd=w.ts;}else if(!locked){if(!sStart)sStart=w.ts;sEnd=w.ts;}prevLocked=locked;});
      if(sStart)sessions.push(Math.max(1,Math.round((new Date(sEnd)-new Date(sStart))/60000)+1));
      var avgSess=sessions.length?Math.round(sessions.reduce(function(a,b){return a+b;},0)/sessions.length):0;
      if(avgSess>0&&avgSess<20)flags.push({type:'micro_sessions',label:'Distracted',detail:'Avg session under 20 min — frequent interruptions',severity:'warn'});
      var longestM=sessions.length?Math.max.apply(null,sessions):0;
      var sessM=wins.length?Math.round((new Date()-new Date(wins[0].ts))/60000):0;
      if(sessM>240&&counts.away===0&&counts.locked===0)flags.push({type:'no_break',label:'No Break',detail:'4h+ with no away or lock detected',severity:'warn'});
      if(counts.spoofed>5)flags.push({type:'spoof_risk',label:'Spoof Risk',detail:counts.spoofed+' spoofed windows detected',severity:'danger'});
      return flags;
    })(),
    login_time:wins.find(w=>w.login_time)?.login_time||null,
    top_apps, top_processes, hourly, unproductive_periods:unproductive,
    state_changes:stateChanges,
    spoof_alerts:wins.filter(w=>w.state==='spoofed').map(w=>({
      ts:w.ts, score:w.spoof_score, reasons:w.spoof_reasons,
    })),
    state_counts:counts,
  };
}

// ── Anti-spoof (8 detectors) ──────────────────────────────────────────────────
function _spoof(win, mps) {
  let score=0; const reasons=[];
  if (_kTs.length>=C.SPOOF_MIN) {
    const {mean,sd}=_stats(_diffs(_kTs));
    if (sd<C.SPOOF_VAR&&mean<3000) { score+=Math.round(55*(1-sd/C.SPOOF_VAR)); reasons.push(`Robotic timing ±${Math.round(sd)}ms`); }
  }
  if (_kCode.length>=C.SPOOF_MIN) {
    const top=_topFreq(_kCode);
    if (top.ratio>=C.SPOOF_REPEAT) { score+=45; reasons.push(`Repeated key ${Math.round(top.ratio*100)}%`); }
  }
  if (_kTs.length>=6) {
    const rTs=_kTs.slice(-10),rC=_kCode.slice(-10),span=rTs[rTs.length-1]-rTs[0],top=_topFreq(rC);
    if (span<1000&&top.ratio>=0.8&&rC.length>=6) { score+=35; reasons.push(`Macro burst ${rC.length} keys in ${span}ms`); }
  }
  const wpm=(win.keys/5)*6;
  if (wpm>C.SPOOF_WPM) { score+=25; reasons.push(`Inhuman WPM ${Math.round(wpm)}`); }
  if (_mDx.length>=10) {
    const {sd:dx}=_stats(_mDx),{sd:dy}=_stats(_mDy);
    if (dx<2&&dy<2) { score+=30; reasons.push(`Robotic mouse Δ±${dx.toFixed(1)}`); }
  }
  const hz=mps/(C.SAMPLE_MS/1000);
  if (hz>C.SPOOF_MOUSE_HZ) { score+=25; reasons.push(`Mouse flood ${Math.round(hz)}/s`); }
  if (_kTs.length>=C.SPOOF_MIN&&_diffs(_kTs).filter(d=>d>800).length===0) { score+=20; reasons.push(`No natural pauses`); }
  if (_screenLocked&&(win.keys+win.clicks)>0&&(Date.now()-_unlockTime)>2000) { score=100; reasons.unshift('INPUT WHILE SCREEN LOCKED'); }
  return {score:Math.min(score,100),reasons};
}

// ── System poll ───────────────────────────────────────────────────────────────
// Lock detection via Windows Security event log (Event 4800=locked, 4801=unlocked)
// This is the only reliable method that works from non-interactive processes
let _lockState = false;
let _firstActivity = null; // override for first activity time
let _lockCount = 0;
let _lastLockState = null; // null = first poll not yet done
let _idleCount = 0;
let _awayCount = 0;
let _lastIdleState = false;
let _lastAwayState = false;

function _pollLockState() {
  // Get last 10 lock/unlock events with timestamps
  // Compare most recent 4800 vs 4801 to determine current state
  const ps = `powershell -NoProfile -NonInteractive -Command "` +
    `try{` +
    `$e=Get-WinEvent -LogName Security -FilterXPath ` +
    `'*[System[EventID=4800 or EventID=4801]]' -MaxEvents 10 -EA Stop;` +
    `$e|ForEach-Object{Write-Output ($_.Id.ToString()+','+([DateTimeOffset]$_.TimeCreated).ToUnixTimeMilliseconds())}` +
    `}catch{Write-Output '0,0'}"`;
  try {
    const out = execSync(ps, {timeout:3000, stdio:['ignore','pipe','ignore']}).toString().trim();
    const lines = out.split(String.fromCharCode(10)).filter(Boolean);
    let lastLock = 0, lastUnlock = 0;
    for (const line of lines) {
      const parts = line.split(',');
      const id = parseInt(parts[0]);
      const ts = parseInt(parts[1]);
      if (id === 4800 && ts > lastLock)   lastLock   = ts;
      if (id === 4801 && ts > lastUnlock) lastUnlock = ts;
    }
    if (lastLock > 0 || lastUnlock > 0) {
      const newLockState = lastLock > lastUnlock;
      // Skip first poll to avoid false transition on startup
      if (_lastLockState !== null && newLockState && !_lastLockState) {
        _lockCount++;
        log('LOCK','Lock #'+_lockCount+' total today');
        _saveCounters();
      }
      if (_lastLockState && !newLockState) {
        _unlockTime = Date.now(); // record unlock time for grace period
      }
      _lastLockState = newLockState;
      _lockState = newLockState;
    }
  } catch(_) {}
}

function _saveCounters() {
  try {
    fs.mkdirSync(C.DATA_DIR, { recursive: true });
    fs.writeFileSync(CTR_FILE, JSON.stringify({
      date: new Date().toDateString(),
      lock_count: _lockCount,
      idle_count: _idleCount,
      away_count: _awayCount,
      first_activity: _firstActivity
    }));
  } catch(e) {}
}

function _pollLogin() {
  const ps = `powershell -NoProfile -NonInteractive -Command "try{` +
    `$boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime;` +
    `$s=Get-CimInstance Win32_LogonSession|?{$_.LogonType -eq 2 -or $_.LogonType -eq 10}|Sort StartTime -Desc;` +
    `$d=$s[0].StartTime;` +
    `if($d -gt $boot){Write-Output (Get-Date $d -Format 'HH:mm')}else{Write-Output ''}` +
    `}catch{Write-Output ''}"`;
  try {
    const out = execSync(ps, {timeout:8000, stdio:['ignore','pipe','ignore']}).toString().trim();
    if (/^\d{2}:\d{2}$/.test(out)) { _loginTime = out; log('ACTIVITY','Login: '+out); }
  } catch(_) {}
}


// ── Lid close / power state detection ────────────────────────────────────────
let _lidClosed = false;
let _lastLidState = false;
let _lidCloseTime = 0;

function _pollLidState() {
  if (process.platform !== 'win32') return;
  // Check battery status — when lid closes on laptop, system goes to sleep/hibernate
  // We detect this via checking if display is off or power state changed
  const ps = `powershell -NoProfile -NonInteractive -Command "` +
    `try{` +
    `$p=Get-WmiObject -Class Win32_Battery -EA Stop;` +
    `$d=Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern int GetSystemPowerStatus(ref SYSTEM_POWER_STATUS s);` +
    `[StructLayout(LayoutKind.Sequential)]public struct SYSTEM_POWER_STATUS{public byte ACL;public byte BatF;public byte BatL;public byte R1;public int BatLifeTime;public int BatFullLifeTime;}' ` +
    `-Name Pwr -PassThru -EA SilentlyContinue;` +
    `$s=New-Object Pwr+SYSTEM_POWER_STATUS;` +
    `$null=[Pwr]::GetSystemPowerStatus([ref]$s);` +
    `Write-Output ($s.ACL.ToString()+','+$s.BatF.ToString())` +
    `}catch{Write-Output '255,255'}"`;
  try {
    const out = execSync(ps, {timeout:3000, stdio:['ignore','pipe','ignore']}).toString().trim();
    const parts = out.split(',');
    // BatFlag 128 = no battery (desktop), 8 = charging, 4 = critical
    // If battery status suddenly drops = lid close / sleep
    const batFlag = parseInt(parts[1]) || 255;
    // Detect display off via PowerShell (more reliable)
    const ps2 = `powershell -NoProfile -NonInteractive -Command "` +
      `try{$m=Get-WmiObject -Namespace root/wmi -Class WmiMonitorBasicDisplayParams -EA Stop;` +
      `Write-Output ($m.Count.ToString())}catch{Write-Output '1'}"`;
    try {
      const monOut = execSync(ps2, {timeout:2000, stdio:['ignore','pipe','ignore']}).toString().trim();
      const monCount = parseInt(monOut) || 1;
      // If monitor count drops to 0 = display off = lid closed
      const newLidState = monCount === 0;
      if (newLidState && !_lastLidState) {
        _lidClosed = true;
        _lidCloseTime = Date.now();
        _isSleeping = true;
        log('POWER', 'Lid closed / display off — session paused');
      } else if (!newLidState && _lastLidState) {
        _lidClosed = false;
        _isSleeping = false;
        _unlockTime = Date.now();
        const lidMin = Math.round((Date.now() - _lidCloseTime) / 60000);
        log('POWER', 'Lid opened — session resumed after ' + lidMin + 'm');
      }
      _lastLidState = newLidState;
    } catch(_) {}
  } catch(_) {}
}

function _pollSystem() {
  if (process.platform!=='win32') return;
  _pollLockState(); setInterval(_pollLockState, 5000);
  // ── Lid close detection via battery/power status ──────────────────
  _pollLidState(); setInterval(_pollLidState, 10000);
  setInterval(_saveCounters, 60000); // Save counters every minute
  setTimeout(_pollLogin, 2000); setInterval(_pollLogin, 300000);
  const PS=`powershell -NoProfile -NonInteractive -Command "
try {
  $h=(Add-Type -Mem '[DllImport(\\"user32\\")]public static extern IntPtr GetForegroundWindow();' -Name W -PassThru -EA SilentlyContinue)::GetForegroundWindow()
  $win=(Get-Process|?{$_.MainWindowHandle-eq $h}|Select -First 1).MainWindowTitle
  $procs=(Get-Process|?{$_.MainWindowTitle -ne ''}|Select -Expand ProcessName|Sort -Unique|Select -First 15) -join ','
  $login=''
  Write-Output (($win,'|',$procs,'|',$login) -join '')
} catch { Write-Output '||' }"`;
  function poll() {
    try {
      const out=execSync(PS,{timeout:2000,stdio:['ignore','pipe','ignore']}).toString().trim();
      const p=out.split('|');
      if (p[0]) _activeWin=p[0].slice(0,100);
      _screenLocked=_lockState;
      if (p[1]) _processList=p[1].split(',').filter(Boolean);
      if (p[2]&&/^\d{2}:\d{2}$/.test(p[2])) _loginTime=p[2];
    } catch(_) {}
  }
  poll(); setInterval(poll, 5000);
}

function _shiftStart() { const d=new Date(); d.setHours(C.SHIFT_START_H,0,0,0); return d.toISOString(); }
function _shiftEnd()   { const d=new Date(); d.setHours(C.SHIFT_END_H,  0,0,0); return d.toISOString(); }
function _blank()      { return {keys:0,clicks:0,moves:0,scrolls:0}; }
function _push(a,v,m)  { a.push(v); if(a.length>m) a.shift(); }
function _diffs(a)     { const d=[]; for(let i=1;i<a.length;i++) d.push(a[i]-a[i-1]); return d; }
function _stats(a) {
  if(!a.length) return {mean:0,sd:0};
  const m=a.reduce((s,v)=>s+v,0)/a.length;
  return {mean:m,sd:Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length)};
}
function _topFreq(a) {
  const f={}; a.forEach(v=>f[v]=(f[v]||0)+1);
  const top=Object.entries(f).sort((a,b)=>b[1]-a[1])[0];
  return {val:top?.[0],ratio:a.length?(top?.[1]||0)/a.length:0};
}
function getLast(n=60) { return _tl.slice(-n); }
function getCurrentState() { return {state:_currentState,sinceMs:Date.now()-_stateStart}; }
function stop() { if(_hook) try{_hook.stop();}catch(_){} if(_winTimer) clearInterval(_winTimer); }


// ── Shift summary ─────────────────────────────────────────────────────────────
// Returns productivity stats for a specific shift window
// shift: { name, start, end } where start/end are 0-24 hours
function shiftSummary(shiftStart, shiftEnd, date) {
  const d = date ? new Date(date) : new Date();
  // Build start/end ISO strings for the shift
  let s, e;
  if (shiftEnd > shiftStart) {
    // Same day shift (e.g. 6-14, 14-22)
    s = new Date(d); s.setHours(shiftStart, 0, 0, 0);
    e = new Date(d); e.setHours(shiftEnd, 0, 0, 0);
  } else {
    // Overnight shift (e.g. 22-6 wraps midnight)
    s = new Date(d); s.setHours(shiftStart, 0, 0, 0);
    e = new Date(d); e.setDate(e.getDate() + 1); e.setHours(shiftEnd, 0, 0, 0);
  }
  return daySummary(s.toISOString(), e.toISOString());
}

module.exports = { init, snapshot, getCurrentState, checkAlerts, daySummary, shiftSummary, getTimeline: () => _tl, getLast, getLastCamSnap, triggerCamCapture: _captureWebcam };
