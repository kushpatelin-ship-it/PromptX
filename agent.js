'use strict';
const { execSync } = require('child_process');
const { detectRole } = require('./lib/role');
const { log }        = require('./lib/logger');

// Kill any process holding our port
try {
  const C = require('./lib/constants');
  const port = C.DASHBOARD_PORT || 4000;
  if (process.platform === 'win32') {
    // Get PIDs using the port (only LISTENING)
    const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {stdio:['ignore','pipe','ignore']}).toString();
    const pids = [...new Set(out.split('\n')
      .map(l=>l.trim().split(/\s+/).pop())
      .filter(p=>/^\d+$/.test(p) && p!=='0' && parseInt(p)!==process.pid))];
    if (pids.length) {
      pids.forEach(pid => { try { execSync(`taskkill /f /pid ${pid}`, {stdio:'ignore'}); } catch(_) {} });
      // Wait for port to free up
      execSync('timeout /t 2 /nobreak', {stdio:'ignore', shell:true});
    }
  }
} catch(_) {}

log('AGENT', 'PromptAI Work+ v13.0 on ' + require('os').hostname());
const role = detectRole();
if (role === 'parent') require('./lib/parent').start();
else                   require('./lib/child').start();
process.on('uncaughtException',  e => log('ERR', e.message));
process.on('unhandledRejection', e => log('ERR', String(e)));
