'use strict';
const fs   = require('fs');
const path = require('path');
const { DATA_DIR } = require('./constants');
const { log } = require('./logger');

const TIMELINE_FILE = path.join(DATA_DIR, 'timeline.json');
const ALERTS_FILE   = path.join(DATA_DIR, 'alerts.json');

// -- Timeline (employee side) --------------------------------------------------
let _tl = [], _tlLoaded = false;

function loadTimeline() {
  if (_tlLoaded) return; _tlLoaded = true;
  try {
    if (fs.existsSync(TIMELINE_FILE)) {
      const d = JSON.parse(fs.readFileSync(TIMELINE_FILE,'utf8'));
      const cutoff = Date.now() - 48*3600*1000;
      _tl = (d.windows||[]).filter(w => new Date(w.ts).getTime() > cutoff);
      log('STORE', `Loaded ${_tl.length} timeline windows`);
    }
  } catch(e) { log('STORE','Load error: '+e.message); }
}

function saveTimeline(windows) {
  _tl = windows;
  try {
    fs.mkdirSync(DATA_DIR, { recursive:true });
    fs.writeFileSync(TIMELINE_FILE, JSON.stringify({ updated:new Date().toISOString(), windows:_tl }));
  } catch(e) { log('STORE','Save error: '+e.message); }
}

function getTimelineSince(isoTs) {
  loadTimeline();
  if (!isoTs) return _tl;
  const cutoff = new Date(isoTs).getTime();
  return _tl.filter(w => new Date(w.ts).getTime() > cutoff);
}

// -- Alert database (boss side) ------------------------------------------------
let _alerts = [], _alertsLoaded = false;

function loadAlerts() {
  if (_alertsLoaded) return; _alertsLoaded = true;
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      const d = JSON.parse(fs.readFileSync(ALERTS_FILE,'utf8'));
      const today = new Date().toDateString();
      _alerts = (d.alerts||[]).filter(a => new Date(a.ts).toDateString() === today);
      log('STORE', `Loaded ${_alerts.length} alerts`);
    }
  } catch(e) { log('STORE','Alert load error: '+e.message); }
}

function _save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive:true });
    fs.writeFileSync(ALERTS_FILE, JSON.stringify({ updated:new Date().toISOString(), alerts:_alerts }));
  } catch(e) { log('STORE','Alert save error: '+e.message); }
}

function addAlert(alert) {
  loadAlerts();
  const hour = new Date(alert.ts).getHours();
  const exists = _alerts.some(a =>
    a.hostname === alert.hostname &&
    a.type     === alert.type &&
    new Date(a.ts).getHours() === hour &&
    !a.dismissed &&
    // For site alerts, deduplicate per site per hour
    (alert.type !== 'blocked_site' || a.site === alert.site)
  );
  if (!exists) {
    _alerts.unshift({ ...alert, id: Date.now().toString(36)+Math.random().toString(36).slice(2,5), dismissed:false });
    if (_alerts.length > 500) _alerts = _alerts.slice(0, 500);
    _save();
    log('ALERT', `[${alert.hostname}] ${alert.type}: ${alert.message}`);
    return true;
  }
  return false;
}

function dismissAlert(id) {
  loadAlerts();
  const a = _alerts.find(a => a.id === id);
  if (a) { a.dismissed = true; a.dismissedAt = new Date().toISOString(); _save(); return true; }
  return false;
}

function getAlerts(includeAll=false) {
  loadAlerts();
  return includeAll ? _alerts : _alerts.filter(a => !a.dismissed);
}

module.exports = { saveTimeline, getTimelineSince, addAlert, dismissAlert, getAlerts, loadAlerts };
