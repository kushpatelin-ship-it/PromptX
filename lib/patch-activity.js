'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'activity.js');
let code = fs.readFileSync(file, 'utf8');
let saves = 0;

// Check what's already applied
const hasCache = code.includes('_daySumCache') || code.includes('_dsc=null') || code.includes('_daySumCacheLen');
const hasCacheInvalid = code.includes('_daySumCacheLen = -1') || code.includes('_dscL = -1') || code.includes('invalidate cache');
const hasPeriodic = code.includes('Save timeline every 60s') || code.includes('60s instead');

console.log('Cache wrapper:', hasCache ? 'DONE' : 'MISSING');
console.log('Cache invalidate:', hasCacheInvalid ? 'DONE' : 'MISSING');
console.log('Periodic save:', hasPeriodic ? 'DONE' : 'MISSING');

// Fix: remove per-snapshot disk write
if (!hasCacheInvalid) {
  const idx = code.indexOf('_tl.push(entry)');
  if (idx >= 0) {
    const chunk = code.slice(idx, idx + 500);
    console.log('\nContext around _tl.push:');
    console.log(chunk);
  }
  // Try regex to find and remove the writeFileSync block after _tl.push
  const before = code.length;
  code = code.replace(
    /\/\/ Persist to disk[\s\S]{0,300}?return entry;/,
    '  _daySumCacheLen = -1;\n  return entry;'
  );
  if (code.length !== before) {
    console.log('\nRemoved disk write - OK');
    saves++;
  } else {
    console.log('\nCould not remove disk write automatically');
  }
} else {
  saves++;
}

// Fix: add periodic save if missing
if (!hasPeriodic) {
  const O3 = '  _pollSystem();\n  _pollBrowserUrls();';
  if (code.includes(O3)) {
    code = code.replace(O3, '  _pollSystem();\n  _pollBrowserUrls();\n  // Save timeline every 60s instead of every snapshot\n  setInterval(function(){try{fs.writeFileSync(TL_FILE,JSON.stringify({updated:new Date().toISOString(),windows:_tl}));}catch(e){}},60000);');
    console.log('Added periodic save - OK');
    saves++;
  }
} else {
  saves++;
}

if (saves >= 2) {
  fs.writeFileSync(file, code);
  console.log('\nactivity.js saved successfully.');
} else {
  console.log('\nNot all patches applied - file NOT saved.');
}
