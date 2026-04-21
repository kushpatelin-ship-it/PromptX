'use strict';
const fs  = require('fs');
const os  = require('os');
const { DATA_DIR, ROLE_FILE } = require('./constants');
const { log } = require('./logger');

function detectRole() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const cli = process.argv.find(a => a.startsWith('--role='));
  if (cli) { const r = cli.split('=')[1]; if (r==='parent'||r==='child') { log('ROLE',r); return r; } }
  if (fs.existsSync(ROLE_FILE)) {
    try {
      const s = JSON.parse(fs.readFileSync(ROLE_FILE, 'utf8'));
      if (s.role==='parent'||s.role==='child') { log('ROLE', s.role+(s.parentIp?' -> '+s.parentIp:'')); return s.role; }
    } catch (_) {}
  }
  fs.writeFileSync(ROLE_FILE, JSON.stringify({ role:'parent', hostname:os.hostname() }, null, 2));
  log('ROLE','No role -> defaulting PARENT');
  return 'parent';
}

function getParentIp() {
  try { return JSON.parse(fs.readFileSync(ROLE_FILE,'utf8')).parentIp || null; } catch(_) { return null; }
}

function saveIp(ip) {
  try {
    const d = JSON.parse(fs.readFileSync(ROLE_FILE,'utf8'));
    if (d.parentIp !== ip) { d.parentIp = ip; fs.writeFileSync(ROLE_FILE, JSON.stringify(d,null,2)); }
  } catch(_) {}
}

module.exports = { detectRole, getParentIp, saveIp, DATA_DIR, ROLE_FILE };
