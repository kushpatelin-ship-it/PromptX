'use strict';
var electron = require('electron');
var app = electron.app;
var BrowserWindow = electron.BrowserWindow;
var Tray = electron.Tray;
var Menu = electron.Menu;
var nativeImage = electron.nativeImage;
var shell = electron.shell;
var path = require('path');
var http = require('http');
var os = require('os');
var fs = require('fs');
var cp = require('child_process');

var PORT = 4000;
var win = null;
var tray = null;
var agentProc = null;
var _dashLoaded = false;
var _agentSpawned = false; // track if WE spawned the agent

app.setPath('userData', path.join(os.homedir(), '.promptai-workplus', 'electron'));
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function findNode() {
  try {
    var found = cp.execSync('where node.exe', {windowsHide:true}).toString().trim().split('\n')[0].trim();
    if (found && fs.existsSync(found)) return found;
  } catch(_) {}
  var candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
    path.join(process.env['APPDATA'] || '', 'nvm', 'current', 'node.exe'),
    path.join(process.env['LOCALAPPDATA'] || '', 'Programs', 'nodejs', 'node.exe'),
    'C:\\Program Files\\nodejs\\node.exe',
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { if (fs.existsSync(candidates[i])) return candidates[i]; } catch(_) {}
  }
  return 'node';
}

// ── KEY FIX: Check if agent is running, wait up to 60s, only spawn if truly absent ──
function startAgent() {
  console.log('[ELECTRON] Checking if agent already running on port ' + PORT + '...');
  waitForExternalAgent(60, function(running) {
    if (running) {
      console.log('[ELECTRON] Agent already running externally — NOT spawning duplicate');
    } else {
      console.log('[ELECTRON] Agent not found after 60s — spawning now');
      spawnAgent();
    }
  });
}

function waitForExternalAgent(maxSeconds, cb) {
  var elapsed = 0;
  function check() {
    var req = http.get('http://localhost:' + PORT + '/api/ping', function(res) {
      res.resume();
      if (res.statusCode === 200) {
        cb(true); // agent is running
      } else {
        retry();
      }
    });
    req.on('error', function() { retry(); });
    req.setTimeout(1000, function() { req.destroy(); retry(); });
  }
  function retry() {
    elapsed += 2;
    if (elapsed >= maxSeconds) {
      cb(false); // gave up
    } else {
      setTimeout(check, 2000);
    }
  }
  check();
}

function spawnAgent() {
  if (_agentSpawned) {
    console.log('[ELECTRON] Already spawned agent once — skipping');
    return;
  }
  _agentSpawned = true;
  try {
    var agentPath = path.join(__dirname, 'agent.js');
    agentProc = cp.spawn('cmd.exe', ['/c', 'node', '"' + agentPath + '"'], {
      cwd: __dirname,
      windowsHide: true,
      stdio: 'pipe',
      detached: false,
      env: Object.assign({}, process.env),
      shell: true,
    });
    agentProc.stdout.on('data', function(d){ console.log('[AGENT]', d.toString().trim()); });
    agentProc.stderr.on('data', function(d){ console.error('[AGENT ERR]', d.toString().trim()); });
    agentProc.on('error', function(e) { console.error('[AGENT SPAWN ERROR]', e.message); });
    agentProc.on('exit', function(code) {
      console.log('[AGENT] exited with code:', code);
      agentProc = null;
      _agentSpawned = false;
      if (!app.isQuitting && code !== 0 && code !== null) {
        console.log('[AGENT] crashed — restarting in 3s');
        _dashLoaded = false;
        setTimeout(startAgent, 3000);
      }
    });
  } catch(e) { console.error('[AGENT START ERROR]', e.message); _agentSpawned = false; }
}

function waitForAgent(cb) {
  setTimeout(function ping() {
    var req = http.get('http://localhost:' + PORT + '/api/ping', function(res) {
      res.resume();
      if (res.statusCode === 200) { cb(); }
      else { setTimeout(ping, 2000); }
    });
    req.on('error', function() { setTimeout(ping, 2000); });
    req.setTimeout(3000, function() { req.destroy(); setTimeout(ping, 2000); });
  }, 1000);
}

function makeTrayIcon() {
  try {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
      '<rect width="16" height="16" rx="3" fill="#0a0f1a"/>' +
      '<text x="1" y="13" font-size="13" fill="#00e676" font-family="Arial" font-weight="bold">W</text></svg>';
    return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'));
  } catch(_) { return nativeImage.createEmpty(); }
}

var LOADING_HTML = '<html><head><style>' +
  'body{margin:0;background:#07090f;display:flex;flex-direction:column;align-items:center;' +
  'justify-content:center;height:100vh;font-family:Segoe UI,sans-serif;gap:16px}' +
  '.logo{font-size:28px;font-weight:800;color:#fff}.logo span{color:#00e676}' +
  '.sub{font-size:12px;color:#4a6080;letter-spacing:.1em;text-transform:uppercase}' +
  '.dots{display:flex;gap:6px}.dot{width:6px;height:6px;border-radius:50%;background:#00e676;' +
  'animation:p 1.4s ease-in-out infinite}.dot:nth-child(2){animation-delay:.2s}' +
  '.dot:nth-child(3){animation-delay:.4s}' +
  '@keyframes p{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}' +
  '</style></head><body>' +
  '<div class=logo>Prompt AI <span>Work+</span></div>' +
  '<div class=sub>Starting... please wait</div>' +
  '<div class=dots><div class=dot></div><div class=dot></div><div class=dot></div></div>' +
  '</body></html>';

function createWindow() {
  if (win) { win.focus(); return; }
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 650,
    title: 'Prompt AI Work+',
    backgroundColor: '#07090f',
    autoHideMenuBar: true,
    show: false,
    icon: makeTrayIcon(),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false },
  });
  win.setMenu(null);
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(LOADING_HTML));
  win.once('ready-to-show', function() { win.show(); });
  win.webContents.on('before-input-event', function(e, input) {
    if (input.key === 'F12') win.webContents.openDevTools();
  });
  win.webContents.on('will-navigate', function(e, url) {
    if (!url.startsWith('http://localhost:' + PORT)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  waitForAgent(function() {
    if (win && !_dashLoaded) {
      _dashLoaded = true;
      win.loadURL('http://localhost:' + PORT);
    }
  });
  win.webContents.setWindowOpenHandler(function(ev) {
    shell.openExternal(ev.url); return { action: 'deny' };
  });
  win.on('close', function(e) {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', function() { win = null; _dashLoaded = false; });
}

function createTray() {
  try {
    tray = new Tray(makeTrayIcon());
    tray.setToolTip('Prompt AI Work+');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: function() { if(win){win.show();win.focus();}else{createWindow();} } },
      { label: 'Hide to Tray', click: function() { if(win) win.hide(); } },
      { type: 'separator' },
      { label: 'Quit', click: function() { app.isQuitting = true; app.quit(); } },
    ]));
    tray.on('double-click', function() {
      if (win) { win.isVisible() ? win.focus() : win.show(); } else { createWindow(); }
    });
  } catch(_) {}
}

app.whenReady().then(function() {
  app.setAppUserModelId('com.promptai.workplus');
  createTray();
  startAgent();
  createWindow();
});

app.on('before-quit', function() {
  app.isQuitting = true;
  if (agentProc) { try { agentProc.kill(); } catch(_) {} }
});
app.on('window-all-closed', function() {});
app.on('activate', function() { if (!win) createWindow(); else win.show(); });
