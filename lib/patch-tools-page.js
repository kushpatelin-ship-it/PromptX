'use strict';
var fs = require('fs');
var path = require('path');

var file = path.join(__dirname, '..', 'ui', 'dashboard.js');
var code = fs.readFileSync(file, 'utf8');

// Remove broken toolsPage and fix exports
var badStart = code.indexOf('\nfunction toolsPage() {');
var badEnd = code.indexOf('\nmodule.exports=');
if (badStart < 0) badStart = code.indexOf('\nfunction toolsPage(){');

if (badStart > 0 && badEnd > badStart) {
  code = code.slice(0, badStart) + code.slice(badEnd);
  console.log('Removed broken toolsPage');
}

// Fix exports to include toolsPage
code = code.replace(
  'module.exports={mainPage,childrenPage,timelinePage,alertsPage,shiftsPage};',
  'module.exports={mainPage,childrenPage,timelinePage,alertsPage,shiftsPage,toolsPage};'
);
code = code.replace(
  'module.exports = {mainPage,childrenPage,timelinePage,alertsPage,shiftsPage};',
  'module.exports = {mainPage,childrenPage,timelinePage,alertsPage,shiftsPage,toolsPage};'
);

// Add clean toolsPage before exports
var TOOLS_PAGE = `
function toolsPage() {
  var H = '<!DOCTYPE html><html><head><meta charset=UTF-8>';
  H += '<style>';
  H += '*{box-sizing:border-box;margin:0;padding:0}';
  H += 'body{background:#07090f;color:#ccd6f0;font-family:Segoe UI,sans-serif;font-size:13px}';
  H += 'header{display:flex;align-items:center;gap:12px;padding:0 28px;height:54px;background:#0d1117;border-bottom:1px solid #1a2332;position:sticky;top:0}';
  H += 'nav{display:flex;background:#0d1117;border-bottom:1px solid #1a2332;padding:0 28px}';
  H += 'nav a{padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a6080;text-decoration:none;border-bottom:2px solid transparent}';
  H += 'nav a.on{color:#00e676;border-bottom-color:#00e676}';
  H += 'main{padding:28px;display:flex;flex-direction:column;gap:20px;max-width:1100px}';
  H += '.card{background:#0d1117;border:1px solid #1a2332;border-radius:10px;padding:20px}';
  H += '.btn{padding:7px 16px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid #1a2332;background:none;color:#4a6080}';
  H += '.btn.g{background:rgba(0,230,118,.1);color:#00e676;border-color:rgba(0,230,118,.25)}';
  H += '.btn.r{background:rgba(255,61,87,.1);color:#ff3d57;border-color:rgba(255,61,87,.25)}';
  H += '.btn.b{background:rgba(41,121,255,.1);color:#2979ff;border-color:rgba(41,121,255,.25)}';
  H += '.inp{width:100%;padding:7px 12px;border-radius:6px;background:#111825;border:1px solid #1a2332;color:#ccd6f0;font-size:12px;outline:none;box-sizing:border-box}';
  H += 'footer{padding:14px 28px;color:#4a6080;font-size:10px;border-top:1px solid #1a2332;background:#0d1117}';
  H += '</style></head><body>';
  H += '<header>';
  H += '<span style="font-size:17px;font-weight:800;color:#fff">PromptAI <span style="color:#00e676">Work+</span></span>';
  H += '<span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.25);margin-left:8px">Parent</span>';
  H += '<span style="margin-left:auto;font-size:11px;color:#4a6080" id=clk></span>';
  H += '</header>';
  H += '<nav><a href=/>Overview</a><a href=/children>Employees</a><a href=/timeline>Timeline</a><a href=/shifts>Shifts</a><a href=/alerts>Alerts</a><a href=/tools class=on>&#129302; AI Tools</a></nav>';
  H += '<main>';
  H += '<div><div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4a6080;margin-bottom:6px">AI Tools Management</div>';
  H += '<div style="font-size:12px;color:#4a6080">Control which AI tools employees see in their Work+ tab. Add, edit, enable/disable or remove tools per department.</div></div>';
  H += '<div id=dept-tabs style="display:flex;gap:8px;flex-wrap:wrap"></div>';
  H += '<div class=card>';
  H += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
  H += '<span style="font-size:13px;font-weight:700;color:#fff" id=dept-title>Engineering Tools</span>';
  H += '<div style="display:flex;gap:8px">';
  H += '<button class="btn b" id=add-btn>+ Add Tool</button>';
  H += '<button class=btn id=reset-btn>Reset Defaults</button>';
  H += '</div></div>';
  H += '<div id=add-form style="display:none;margin-bottom:16px;padding:14px;background:rgba(255,255,255,.03);border-radius:8px"></div>';
  H += '<div id=tools-list><div style="color:#4a6080;padding:20px;text-align:center">Loading...</div></div>';
  H += '</div></main>';
  H += '<footer>PromptAI Work+ v14.0 &mdash; AI Tools Manager</footer>';
  H += '<script>';
  H += '(function t(){var e=document.getElementById("clk");if(e)e.textContent=new Date().toLocaleTimeString();setTimeout(t,1000);})();';
  H += 'var DEPTS={engineering:"Engineering",sales:"Sales",operations:"Operations",support:"Support",executive:"Executive",marketing:"Marketing"};';
  H += 'var ICONS={engineering:"💻",sales:"📈",operations:"⚙️",support:"🎧",executive:"👔",marketing:"📣"};';
  H += 'var _dept="engineering";';
  H += 'var dtabs=document.getElementById("dept-tabs");';
  H += 'Object.keys(DEPTS).forEach(function(d,i){';
  H += '  var b=document.createElement("button");';
  H += '  b.className="btn"+(i===0?" b":"");b.id="dt-"+d;';
  H += '  b.textContent=(ICONS[d]||"")+" "+DEPTS[d];';
  H += '  b.onclick=function(){selDept(d);};';
  H += '  dtabs.appendChild(b);';
  H += '});';
  H += 'document.getElementById("add-btn").onclick=showAddForm;';
  H += 'document.getElementById("reset-btn").onclick=resetDept;';
  H += 'function selDept(d){';
  H += '  _dept=d;';
  H += '  document.querySelectorAll("#dept-tabs button").forEach(function(b){b.className="btn";});';
  H += '  document.getElementById("dt-"+d).className="btn b";';
  H += '  document.getElementById("dept-title").textContent=DEPTS[d]+" Tools";';
  H += '  loadTools();';
  H += '}';
  H += 'function loadTools(){';
  H += '  fetch("/api/tools?dept="+_dept+"&all=1").then(function(r){return r.json();}).then(function(d){renderTools(d.tools||[]);}).catch(function(){});';
  H += '}';
  H += 'function renderTools(tools){';
  H += '  var list=document.getElementById("tools-list");';
  H += '  list.innerHTML="";';
  H += '  if(!tools.length){';
  H += '    var emp=document.createElement("div");';
  H += '    emp.style.cssText="color:#4a6080;padding:20px;text-align:center";';
  H += '    emp.textContent="No tools yet. Click + Add Tool.";';
  H += '    list.appendChild(emp);return;';
  H += '  }';
  H += '  tools.forEach(function(t){';
  H += '    var row=document.createElement("div");';
  H += '    row.style.cssText="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:rgba(255,255,255,.02);border:1px solid #1a2332;margin-bottom:6px"+(t.enabled===false?";opacity:.4":"");';
  H += '    var ico=document.createElement("span");ico.style.fontSize="20px";ico.textContent=t.icon||"🔧";';
  H += '    var info=document.createElement("div");info.style.flex="1";info.style.minWidth="0";';
  H += '    var nm=document.createElement("div");nm.style.cssText="font-size:13px;font-weight:700;color:#fff";nm.textContent=t.name;';
  H += '    if(t.badge){var bg=document.createElement("span");bg.style.cssText="font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;background:#0d2a1a;color:#00e676;border:1px solid #1a4a2a;margin-left:6px";bg.textContent=t.badge;nm.appendChild(bg);}';
  H += '    var dc=document.createElement("div");dc.style.cssText="font-size:11px;color:#4a6080;margin-top:2px";dc.textContent=t.desc;';
  H += '    var ul=document.createElement("a");ul.href=t.url;ul.target="_blank";ul.style.cssText="font-size:10px;color:#2979ff;display:block";ul.textContent=t.url;';
  H += '    info.appendChild(nm);info.appendChild(dc);info.appendChild(ul);';
  H += '    var acts=document.createElement("div");acts.style.cssText="display:flex;gap:6px;flex-shrink:0";';
  H += '    var eb=document.createElement("button");eb.className="btn b";eb.textContent="Edit";';
  H += '    (function(tid){eb.onclick=function(){editTool(tid);};})(t.id);';
  H += '    var tb=document.createElement("button");tb.className="btn";tb.textContent=t.enabled===false?"Enable":"Disable";';
  H += '    (function(tid){tb.onclick=function(){toggleTool(tid);};})(t.id);';
  H += '    var db=document.createElement("button");db.className="btn r";db.textContent="Delete";';
  H += '    (function(tid){db.onclick=function(){deleteTool(tid);};})(t.id);';
  H += '    acts.appendChild(eb);acts.appendChild(tb);acts.appendChild(db);';
  H += '    row.appendChild(ico);row.appendChild(info);row.appendChild(acts);';
  H += '    list.appendChild(row);';
  H += '  });';
  H += '}';
  H += 'function showAddForm(){';
  H += '  var f=document.getElementById("add-form");';
  H += '  if(f.style.display!=="none"){f.style.display="none";return;}';
  H += '  f.style.display="block";f.innerHTML="";';
  H += '  var g=document.createElement("div");g.style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px";';
  H += '  [["f-nm","Tool name"],["f-url","URL (https://...)"],["f-ico","Icon emoji"],["f-badge","Badge label"]].forEach(function(p){';
  H += '    var i=document.createElement("input");i.className="inp";i.id=p[0];i.placeholder=p[1];g.appendChild(i);';
  H += '  });';
  H += '  var desc=document.createElement("input");desc.className="inp";desc.id="f-desc";desc.placeholder="Short description";desc.style.marginBottom="8px";';
  H += '  var btns=document.createElement("div");btns.style.cssText="display:flex;gap:8px";';
  H += '  var ab=document.createElement("button");ab.className="btn g";ab.textContent="Add Tool";ab.onclick=addTool;';
  H += '  var cb=document.createElement("button");cb.className="btn";cb.textContent="Cancel";cb.onclick=function(){f.style.display="none";};';
  H += '  btns.appendChild(ab);btns.appendChild(cb);';
  H += '  f.appendChild(g);f.appendChild(desc);f.appendChild(btns);';
  H += '}';
  H += 'function addTool(){';
  H += '  var n=document.getElementById("f-nm").value.trim();';
  H += '  var u=document.getElementById("f-url").value.trim();';
  H += '  if(!n||!u){alert("Name and URL required");return;}';
  H += '  var d=document.getElementById("f-desc").value.trim();';
  H += '  var i=document.getElementById("f-ico").value.trim()||"🔧";';
  H += '  var b=document.getElementById("f-badge").value.trim();';
  H += '  fetch("/api/tools?dept="+_dept,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"add",name:n,url:u,desc:d,icon:i,badge:b})})';
  H += '    .then(function(){document.getElementById("add-form").style.display="none";loadTools();});';
  H += '}';
  H += 'function toggleTool(id){fetch("/api/tools?dept="+_dept,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"toggle",id:id})}).then(function(){loadTools();});}';
  H += 'function deleteTool(id){if(!confirm("Delete this tool?"))return;fetch("/api/tools?dept="+_dept,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",id:id})}).then(function(){loadTools();});}';
  H += 'function editTool(id){';
  H += '  fetch("/api/tools?dept="+_dept).then(function(r){return r.json();}).then(function(d){';
  H += '    var t=d.tools.find(function(x){return x.id===id;});if(!t)return;';
  H += '    var n=prompt("Tool name:",t.name);if(!n)return;';
  H += '    var u=prompt("URL:",t.url);if(!u)return;';
  H += '    var dc=prompt("Description:",t.desc)||t.desc;';
  H += '    var ic=prompt("Icon emoji:",t.icon)||t.icon;';
  H += '    var bg=prompt("Badge label:",t.badge)||"";';
  H += '    fetch("/api/tools?dept="+_dept,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"edit",id:id,name:n,url:u,desc:dc,icon:ic,badge:bg})}).then(function(){loadTools();});';
  H += '  });';
  H += '}';
  H += 'function resetDept(){if(!confirm("Reset "+DEPTS[_dept]+" tools to defaults?"))return;fetch("/api/tools?dept="+_dept,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reset"})}).then(function(){loadTools();});}';
  H += 'loadTools();';
  H += '</script></body></html>';
  return H;
}
`;

code = code.replace(
  'module.exports={mainPage,childrenPage,timelinePage,alertsPage,shiftsPage,toolsPage};',
  TOOLS_PAGE + 'module.exports={mainPage,childrenPage,timelinePage,alertsPage,shiftsPage,toolsPage};'
);

fs.writeFileSync(file, code);
console.log('DONE - toolsPage fixed, size:', fs.statSync(file).size);
