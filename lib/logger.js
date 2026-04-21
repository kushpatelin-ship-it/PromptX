'use strict';
const fs = require('fs');
const { DATA_DIR, LOG_FILE } = require('./constants');
let _ok = false;
function _init() { if (_ok) return; try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} _ok = true; }
function log(tag, msg) {
  _init();
  const line = `[${new Date().toISOString().slice(11,23)}] [${tag.padEnd(8)}] ${msg}\n`;
  process.stderr.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
}
module.exports = { log };
