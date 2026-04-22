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
var _dashLoaded = false;

app.setPath('userData', path.join(os.homedir(), '.promptai-workplus', 'electron'));
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Detect role
function getRole() {
  try {
    var f = path.join(os.homedir(), '.promptai-workplus', 'role.json');
    return JSON.parse(fs.readFileSync(f, 'utf8')).role || 'parent';
  } catch(_) { return 'parent'; }
}
var IS_CHILD = getRole() === 'child';

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

function waitForAgent(cb) {
  setTimeout(function ping() {
    var req = http.get('http://localhost:' + PORT + '/api/ping', function(res) {
      res.resume();
      if (res.statusCode === 200) { cb(); } else { setTimeout(ping, 2000); }
    });
    req.on('error', function() { setTimeout(ping, 2000); });
    req.setTimeout(3000, function() { req.destroy(); setTimeout(ping, 2000); });
  }, 1000);
}

function createWindow() {
  if (win) { win.focus(); return; }

  win = new BrowserWindow({
    width: IS_CHILD ? 1280 : 1400,
    height: IS_CHILD ? 820 : 900,
    minWidth: IS_CHILD ? 900 : 1000,
    minHeight: IS_CHILD ? 600 : 650,
    title: IS_CHILD ? 'Work+' : 'Prompt AI Work+',
    backgroundColor: '#07090f',
    autoHideMenuBar: true,
    show: false,
    icon: makeTrayIcon(),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false },
  });

  win.setMenu(null);

  // Employee: block dev tools and context menu
  if (IS_CHILD) {
    win.webContents.on('context-menu', function(e) { e.preventDefault(); });
    win.webContents.on('before-input-event', function(e, input) {
      if (input.key === 'F12' ||
        (input.control && input.shift && (input.key === 'I' || input.key === 'J')) ||
        (input.control && (input.key === 'u' || input.key === 'U'))) {
        e.preventDefault();
      }
    });
  } else {
    win.webContents.on('before-input-event', function(e, input) {
      if (input.key === 'F12') win.webContents.openDevTools();
    });
  }

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(LOADING_HTML));
  win.once('ready-to-show', function() { win.show(); });

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
    tray.setToolTip(IS_CHILD ? 'Work+' : 'Prompt AI Work+');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: function() { if(win){win.show();win.focus();}else{createWindow();} } },
      { label: 'Hide', click: function() { if(win) win.hide(); } },
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
  createWindow();
});

app.on('before-quit', function() { app.isQuitting = true; });
app.on('window-all-closed', function() {});
app.on('activate', function() { if (!win) createWindow(); else win.show(); });
