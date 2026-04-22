'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');

var file = path.join(__dirname, '..', 'lib', 'child.js');
var code = fs.readFileSync(file, 'utf8');

if (code.includes('nav-wp') || code.includes('loadWorkPlus')) {
  console.log('Work+ tab already present');
  process.exit(0);
}

// 1. Add Work+ to nav
code = code.replace(
  '<a href="#" id=nav-tl onclick="showTab(\'tl\');return false;" style="padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a6080;text-decoration:none;border-bottom:2px solid transparent;letter-spacing:.06em">My Timeline</a>\n    </nav>',
  '<a href="#" id=nav-tl onclick="showTab(\'tl\');return false;" style="padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a6080;text-decoration:none;border-bottom:2px solid transparent;letter-spacing:.06em">My Timeline</a>\n      <a href="#" id=nav-wp onclick="showTab(\'wp\');return false;" style="padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a6080;text-decoration:none;border-bottom:2px solid transparent;letter-spacing:.06em">&#129302; Work+</a>\n    </nav>'
);
console.log('Nav tab added:', code.includes('nav-wp'));

// 2. Add Work+ HTML tab before footer
var footerIdx = code.indexOf('    <footer style="padding:18px 28px');
if (footerIdx < 0) footerIdx = code.indexOf('    <footer ');

var wpHtml = [
  '    <div id=tab-wp style=display:none>',
  '    <main style="padding:28px;max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:24px">',
  '      <div style="text-align:center;padding:32px 20px 24px;border-bottom:1px solid #1a2332">',
  '        <div style="font-size:32px;margin-bottom:10px">&#129302;</div>',
  '        <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:6px">Work+ AI Tools</div>',
  '        <div style="font-size:12px;color:#4a6080;max-width:460px;margin:0 auto;line-height:1.7">AI tools curated for your role by your manager.</div>',
  '        <div id=wp-dept-badge style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(0,230,118,.08);color:#00e676;border:1px solid rgba(0,230,118,.2)">Loading...</div>',
  '      </div>',
  '      <div id=wp-tools-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px"></div>',
  '      <div style="text-align:center;padding:16px;color:#2a3a4a;font-size:11px">&#128273; Tools managed by your manager</div>',
  '    </main>',
  '    </div>',
  ''
].join('\n');

code = code.slice(0, footerIdx) + wpHtml + code.slice(footerIdx);
console.log('Work+ HTML added:', code.includes('tab-wp'));

// 3. Add /api/tools to proxy routes
code = code.replace(
  "'/api/messages']",
  "'/api/messages','/api/tools']"
);

// 4. Update showTab
code = code.replace(
  "        document.getElementById('tab-tl').style.display   = tab==='tl'?'':'none';\n        var nd=document.getElementById('nav-dash'),nt=document.getElementById('nav-tl');\n        if(nd){nd.style.color=tab==='dash'?'#00e676':'#4a6080';nd.style.borderBottomColor=tab==='dash'?'#00e676':'transparent';}\n        if(nt){nt.style.color=tab==='tl'?'#00e676':'#4a6080';nt.style.borderBottomColor=tab==='tl'?'#00e676':'transparent';}\n        if(tab==='tl')loadTimeline();",
  "        document.getElementById('tab-tl').style.display=tab==='tl'?'':'none';\n        var twp=document.getElementById('tab-wp');if(twp)twp.style.display=tab==='wp'?'':'none';\n        var nd=document.getElementById('nav-dash'),nt=document.getElementById('nav-tl'),nw=document.getElementById('nav-wp');\n        if(nd){nd.style.color=tab==='dash'?'#00e676':'#4a6080';nd.style.borderBottomColor=tab==='dash'?'#00e676':'transparent';}\n        if(nt){nt.style.color=tab==='tl'?'#00e676':'#4a6080';nt.style.borderBottomColor=tab==='tl'?'#00e676':'transparent';}\n        if(nw){nw.style.color=tab==='wp'?'#00e676':'#4a6080';nw.style.borderBottomColor=tab==='wp'?'#00e676':'transparent';}\n        if(tab==='tl')loadTimeline();\n        if(tab==='wp')loadWorkPlus();"
);
console.log('showTab updated:', code.includes('loadWorkPlus'));

// 5. Add loadWorkPlus function before wire-up
var wireIdx = code.indexOf('      // Wire up header and FAB buttons after DOM ready');
if (wireIdx < 0) wireIdx = code.indexOf('      (function(){');

var wpJs = [
  "      // Work+ AI Tools tab",
  "      var _wpLoaded=false;",
  "      function loadWorkPlus(){",
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
  "              var emp=document.createElement('div');emp.style.cssText='color:#4a6080;padding:20px;text-align:center;grid-column:1/-1';",
  "              emp.textContent='No tools configured yet. Ask your manager to add tools for your department.';",
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
  "              btn.innerHTML='Open &#8599;';",
  "              btn.onmouseover=function(){this.style.background='#112a1a';};",
  "              btn.onmouseout=function(){this.style.background='#0d2a1a';};",
  "              card.appendChild(row);card.appendChild(desc);card.appendChild(btn);",
  "              grid.appendChild(card);",
  "            });",
  "          }).catch(function(){});",
  "        }).catch(function(){});",
  "      }",
  ""
].join('\n');

code = code.slice(0, wireIdx) + wpJs + code.slice(wireIdx);

fs.writeFileSync(file, code);
console.log('DONE - Work+ tab added to employee dashboard, size:', fs.statSync(file).size);
