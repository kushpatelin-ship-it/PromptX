'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'activity.js');
let code = fs.readFileSync(file, 'utf8');
let applied = 0;

// ── PATCH 1: Make _pollLockState async ──────────────────────────────────────
const OLD_LOCK = `function _pollLockState() {
  // Get last 10 lock/unlock events with timestamps
  // Compare most recent 4800 vs 4801 to determine current state
  const ps = \`powershell -NoProfile -NonInteractive -Command "\` +
    \`try{\` +
    \`$e=Get-WinEvent -LogName Security -FilterXPath \` +
    \`'*[System[EventID=4800 or EventID=4801]]' -MaxEvents 10 -EA Stop;\` +
    \`$e|ForEach-Object{Write-Output ($_.Id.ToString()+','+([DateTimeOffset]$_.TimeCreated).ToUnixTimeMilliseconds())}\` +
    \`}catch{Write-Output '0,0'}"`;

const NEW_LOCK = `let _lockPollRunning = false;
function _pollLockState() {
  if (_lockPollRunning) return;
  _lockPollRunning = true;
  const { spawn } = require('child_process');
  const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command',
    "try{$e=Get-WinEvent -LogName Security -FilterXPath '*[System[EventID=4800 or EventID=4801]]' -MaxEvents 10 -EA Stop;$e|ForEach-Object{Write-Output ($_.Id.ToString()+','+([DateTimeOffset]$_.TimeCreated).ToUnixTimeMilliseconds())}}catch{Write-Output '0,0'}"
  ], { stdio: ['ignore','pipe','ignore'], windowsHide: true });
  let out = '';
  ps.stdout.on('data', d => { out += d.toString(); });
  ps.on('close', () => {
    _lockPollRunning = false;
    try {
      const lines = out.trim().split('\\n').filter(Boolean);
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
        if (_lastLockState !== null && newLockState && !_lastLockState) {
          _lockCount++; log('LOCK','Lock #'+_lockCount+' total today'); _saveCounters();
        }
        if (_lastLockState && !newLockState) _unlockTime = Date.now();
        _lastLockState = newLockState; _lockState = newLockState;
      }
    } catch(_) {}
  });
  ps.on('error', () => { _lockPollRunning = false; });
  setTimeout(() => { try { ps.kill(); } catch(_) {} _lockPollRunning = false; }, 5000);
  // dummy line to replace original try block start`;

if (code.includes(OLD_LOCK)) {
  // Find the full function end
  const startIdx = code.indexOf(OLD_LOCK);
  // Find closing brace of the original function
  const afterStart = code.indexOf('  } catch(_) {}\n}', startIdx);
  if (afterStart > 0) {
    const fullOld = code.slice(startIdx, afterStart + '  } catch(_) {}\n}'.length);
    code = code.slice(0, startIdx) + NEW_LOCK + '\n}' + code.slice(afterStart + '  } catch(_) {}\n}'.length);
    console.log('PATCH 1 _pollLockState async: OK');
    applied++;
  } else {
    console.log('PATCH 1: could not find function end');
  }
} else {
  console.log('PATCH 1 _pollLockState: MARKER NOT FOUND');
}

// ── PATCH 2: Make window poll async ─────────────────────────────────────────
const OLD_POLL = `  function poll() {
    try {
      const out=execSync(PS,{timeout:2000,stdio:['ignore','pipe','ignore']}).toString().trim();
      const p=out.split('|');
      if (p[0]) _activeWin=p[0].slice(0,100);
      _screenLocked=_lockState;
      if (p[1]) _processList=p[1].split(',').filter(Boolean);
      if (p[2]&&/^\\d{2}:\\d{2}$/.test(p[2])) _loginTime=p[2];
    } catch(_) {}
  }
  poll(); setInterval(poll, 5000);`;

const NEW_POLL = `  let _winPollRunning = false;
  function poll() {
    if (_winPollRunning) return;
    _winPollRunning = true;
    const { spawn } = require('child_process');
    const ps2 = spawn('powershell', ['-NoProfile','-NonInteractive','-Command',
      "try{$h=(Add-Type -Mem '[DllImport(\"user32\")]public static extern IntPtr GetForegroundWindow();' -Name W -PassThru -EA SilentlyContinue)::GetForegroundWindow();$win=(Get-Process|?{$_.MainWindowHandle-eq $h}|Select -First 1).MainWindowTitle;$procs=(Get-Process|?{$_.MainWindowTitle -ne ''}|Select -Expand ProcessName|Sort -Unique|Select -First 15) -join ',';Write-Output ($win+'|'+$procs+'|')}catch{Write-Output '||'}"
    ], { stdio:['ignore','pipe','ignore'], windowsHide:true });
    let out = '';
    ps2.stdout.on('data', d => { out += d.toString(); });
    ps2.on('close', () => {
      _winPollRunning = false;
      try {
        const p = out.trim().split('|');
        if (p[0]) _activeWin = p[0].slice(0,100);
        _screenLocked = _lockState;
        if (p[1]) _processList = p[1].split(',').filter(Boolean);
      } catch(_) {}
    });
    ps2.on('error', () => { _winPollRunning = false; });
    setTimeout(() => { try { ps2.kill(); } catch(_) {} _winPollRunning = false; }, 4000);
  }
  poll(); setInterval(poll, 5000);`;

if (code.includes(OLD_POLL)) {
  code = code.replace(OLD_POLL, NEW_POLL);
  console.log('PATCH 2 window poll async: OK');
  applied++;
} else {
  console.log('PATCH 2 window poll: MARKER NOT FOUND');
  // Show context
  const idx = code.indexOf('function poll()');
  if (idx >= 0) console.log('poll() found at:', code.slice(idx, idx+200));
}

// ── PATCH 3: Make _pollLogin async ──────────────────────────────────────────
const OLD_LOGIN = `function _pollLogin() {
  const ps = \`powershell -NoProfile -NonInteractive -Command "try{\` +
    \`$boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime;\` +
    \`$s=Get-CimInstance Win32_LogonSession|?{$_.LogonType -eq 2 -or $_.LogonType -eq 10}|Sort StartTime -Desc;\` +
    \`$d=$s[0].StartTime;\` +
    \`if($d -gt $boot){Write-Output (Get-Date $d -Format 'HH:mm')}else{Write-Output ''}\` +
    \`}catch{Write-Output ''}"`;

const NEW_LOGIN = `function _pollLogin() {
  const { spawn } = require('child_process');
  const lps = spawn('powershell', ['-NoProfile','-NonInteractive','-Command',
    "try{$boot=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime;$s=Get-CimInstance Win32_LogonSession|?{$_.LogonType -eq 2 -or $_.LogonType -eq 10}|Sort StartTime -Desc;$d=$s[0].StartTime;if($d -gt $boot){Write-Output (Get-Date $d -Format 'HH:mm')}else{Write-Output ''}}catch{Write-Output ''}"
  ], { stdio:['ignore','pipe','ignore'], windowsHide:true });
  let out = '';
  lps.stdout.on('data', d => { out += d.toString(); });
  lps.on('close', () => {
    try { const t=out.trim(); if(/^\\d{2}:\\d{2}$/.test(t)){_loginTime=t;log('ACTIVITY','Login: '+t);} } catch(_){}
  });
  lps.on('error', ()=>{});
  setTimeout(()=>{ try{lps.kill();}catch(_){} }, 10000);
  // dummy to replace try block`;

if (code.includes(OLD_LOGIN)) {
  const startIdx = code.indexOf(OLD_LOGIN);
  const afterStart = code.indexOf('\n  } catch(_) {}\n}', startIdx);
  if (afterStart > 0) {
    code = code.slice(0, startIdx) + NEW_LOGIN + '\n}' + code.slice(afterStart + '\n  } catch(_) {}\n}'.length);
    console.log('PATCH 3 _pollLogin async: OK');
    applied++;
  } else {
    console.log('PATCH 3: could not find function end');
  }
} else {
  console.log('PATCH 3 _pollLogin: MARKER NOT FOUND');
}

console.log('\nPatches applied: ' + applied + '/3');
if (applied > 0) {
  fs.writeFileSync(file, code);
  console.log('activity.js saved.');
  console.log('Restart the app: taskkill /F /IM node.exe && node agent.js');
} else {
  console.log('No changes made.');
}
