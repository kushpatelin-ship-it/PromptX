'use strict';
var fs = require('fs');
var file = require('path').join(__dirname, '..', 'lib', 'child.js');
var code = fs.readFileSync(file, 'utf8');

// Check current syntax
var s = code.slice(code.indexOf('<script>')+8, code.lastIndexOf('</script>'));
try { new Function(s); console.log('Already valid'); process.exit(0); } catch(e) {}

// Strategy: find loadWorkPlus and rewrite it completely
var wpStart = code.indexOf('      function loadWorkPlus(){');
var wpEnd = code.indexOf('\n      // Track privacy breaks', wpStart);
if (wpStart < 0 || wpEnd < 0) { console.log('Cannot find loadWorkPlus'); process.exit(1); }

var newWP = [
  '      function loadWorkPlus(){',
  "        fetch('/api/emp-self').then(function(r){return r.json();}).then(function(d){",
  "          var dept=(d.dept||'engineering').toLowerCase();",
  "          var deptNames={engineering:'Engineering',sales:'Sales',operations:'Operations',support:'Support',executive:'Executive',marketing:'Marketing'};",
  "          var badge=document.getElementById('wp-dept-badge');",
  "          if(badge)badge.textContent=(deptNames[dept]||dept)+' Department Tools';",
  "          fetch('/api/tools?dept='+encodeURIComponent(dept)).then(function(r){return r.json();}).then(function(td){",
  "            var tools=td.tools||[];",
  "            var grid=document.getElementById('wp-tools-grid');",
  "            if(!grid)return;",
  "            grid.innerHTML='';",
  "            if(!tools.length){",
  "              var emp=document.createElement('div');",
  "              emp.style.cssText='color:#4a6080;padding:20px;text-align:center;grid-column:1/-1';",
  "              emp.textContent='No tools configured for your department yet.';",
  "              grid.appendChild(emp);return;",
  "            }",
  "            tools.forEach(function(t){",
  "              var card=document.createElement('div');",
  "              card.style.cssText='background:#0d1117;border:1px solid #1a2332;border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:10px';",
  "              card.onmouseover=function(){this.style.borderColor='#00e676';};",
  "              card.onmouseout=function(){this.style.borderColor='#1a2332';};",
  "              var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px';",
  "              var ico=document.createElement('span');ico.style.fontSize='22px';ico.textContent=t.icon||'🔧';",
  "              var nw=document.createElement('div');nw.style.flex='1';",
  "              var ne=document.createElement('div');ne.style.cssText='font-size:13px;font-weight:700;color:#fff';ne.textContent=t.name;",
  "              if(t.badge){var b=document.createElement('span');b.style.cssText='font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:#0d2a1a;color:#00e676;border:1px solid #1a4a2a;margin-left:6px';b.textContent=t.badge;ne.appendChild(b);}",
  "              nw.appendChild(ne);row.appendChild(ico);row.appendChild(nw);",
  "              var desc=document.createElement('div');desc.style.cssText='font-size:11px;color:#4a6080;line-height:1.6;flex:1';desc.textContent=t.desc;",
  "              var btn=document.createElement('a');btn.href=t.url;btn.target='_blank';",
  "              btn.style.cssText='display:flex;align-items:center;justify-content:center;padding:7px;border-radius:8px;font-size:11px;font-weight:700;background:#0d2a1a;color:#00e676;border:1px solid #1a4a2a;text-decoration:none';",
  "              btn.textContent='Open';",
  "              card.appendChild(row);card.appendChild(desc);card.appendChild(btn);",
  "              grid.appendChild(card);",
  "            });",
  "          }).catch(function(){});",
  "        }).catch(function(){});",
  "        var log=document.getElementById('wp-privacy-log');",
  "        if(log&&_privacyBreaks&&_privacyBreaks.length){",
  "          log.innerHTML=_privacyBreaks.map(function(b){",
  "            return '<div style=display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a2332><span style=color:#ccd6f0>Privacy Break</span><span style=color:#4a6080>'+b.start+' &mdash; '+(b.end||'ongoing')+'</span></div>';",
  "          }).join('');",
  "        }",
  "      }",
  ""
].join('\n');

code = code.slice(0, wpStart) + newWP + code.slice(wpEnd);

// Verify
var s2 = code.slice(code.indexOf('<script>')+8, code.lastIndexOf('</script>'));
try {
  new Function(s2);
  fs.writeFileSync(file, code);
  console.log('FIXED - script valid, size:', fs.statSync(file).size);
} catch(e) {
  console.log('Still broken:', e.message);
}
