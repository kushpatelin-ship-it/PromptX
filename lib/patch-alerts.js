'use strict';
const fs = require('fs');
const path = require('path');

const alertsFile = path.join(__dirname, '..', 'ui', 'alerts.js');

const newContent = `"use strict";
function alertsPage() {
  var css = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    "body{background:#07090f;color:#ccd6f0;font-family:Segoe UI,sans-serif;font-size:13px}",
    "header{display:flex;align-items:center;gap:12px;padding:0 28px;height:54px;background:#0d1117;border-bottom:1px solid #1a2332;position:sticky;top:0}",
    "nav{display:flex;background:#0d1117;border-bottom:1px solid #1a2332;padding:0 28px}",
    "nav a{padding:12px 18px;font-size:11px;font-weight:600;text-transform:uppercase;color:#4a6080;text-decoration:none;border-bottom:2px solid transparent}",
    "nav a.on{color:#00e676;border-bottom-color:#00e676}",
    "main{padding:28px;display:flex;flex-direction:column;gap:16px}",
    ".lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4a6080;margin-bottom:12px}",
    ".astat{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px}",
    ".asbox{background:#0d1117;border:1px solid #1a2332;border-radius:8px;padding:14px;text-align:center}",
    ".asval{font-size:24px;font-weight:800;color:#fff;margin-bottom:3px}",
    ".aslbl{font-size:9px;font-weight:700;text-transform:uppercase;color:#4a6080}",
    ".fr{display:flex;gap:8px;flex-wrap:wrap}",
    ".fb{padding:5px 14px;border-radius:20px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid #1a2332;color:#4a6080;background:none}",
    ".fon{border-color:#00e676;color:#00e676;background:rgba(0,230,118,.08)}",
    ".ac{background:#0d1117;border:1px solid #1a2332;border-radius:8px;padding:14px 18px;display:flex;gap:14px;margin-bottom:8px;align-items:flex-start}",
    ".acsl{border-left:4px solid #2979ff}",
    ".acaw{border-left:4px solid #ffab00}",
    ".acsp{border-left:4px solid #ff3d57}",
    ".acmsg{border-left:4px solid #2979ff}",
    ".acdis{opacity:.3}",
    ".ai{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;background:rgba(255,255,255,.05)}",
    ".ab{flex:1;min-width:0}",
    ".ah{font-size:13px;font-weight:700;color:#fff;margin-bottom:3px}",
    ".am{font-size:12px;margin-bottom:5px}",
    ".at{font-size:10px;color:#4a6080;display:flex;gap:10px;flex-wrap:wrap}",
    ".acts{display:flex;flex-direction:column;gap:5px;flex-shrink:0}",
    ".db{padding:5px 14px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid #1a2332;color:#4a6080;background:none;white-space:nowrap}",
    ".db:hover{background:rgba(255,255,255,.04)}",
    ".dbr{color:#ff3d57;border-color:rgba(255,61,87,.3)}.dbr:hover{background:rgba(255,61,87,.06)}",
    ".dbb{color:#2979ff;border-color:rgba(41,121,255,.3)}.dbb:hover{background:rgba(41,121,255,.06)}",
    ".es{text-align:center;padding:60px;color:#4a6080}",
    ".reply-box{display:flex;gap:6px;margin-top:8px;align-items:center}",
    ".reply-inp{flex:1;padding:6px 10px;border-radius:6px;background:#111825;border:1px solid #1a2332;color:#ccd6f0;font-size:11px;outline:none}",
    "footer{padding:14px 28px;color:#4a6080;font-size:10px;border-top:1px solid #1a2332;background:#0d1117}"
  ].join("");

  var header = '<header>'
    + '<span style="font-size:17px;font-weight:800;color:#fff">PromptAI <span style="color:#00e676">Work+</span></span>'
    + '<span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,230,118,.1);color:#00e676;border:1px solid rgba(0,230,118,.25);margin-left:8px">Parent</span>'
    + '<span style="margin-left:auto;font-size:11px;color:#4a6080" id=clk></span>'
    + '</header>';

  var nav = '<nav>'
    + '<a href=/>Overview</a>'
    + '<a href=/children>Employees</a>'
    + '<a href=/timeline>Timeline</a>'
    + '<a href=/alerts class=on>Alerts</a>'
    + '</nav>';

  var filters = '<div class=fr>'
    + '<button class="fb fon" onclick="sf(1)">Active</button>'
    + '<button class=fb onclick="sf(2)">All today</button>'
    + '<button class=fb onclick="sf(3)">Sign-offs</button>'
    + '<button class=fb onclick="sf(4)">Blocked sites</button>'
    + '<button class=fb onclick="sf(5)">Spoof</button>'
    + '<button class=fb onclick="sf(6)">Low productivity</button>'
    + '<button class=fb onclick="sf(7)">Away</button>'
    + '<button class=fb onclick="sf(8)">Messages</button>'
    + '</div>';

  var js = [
    '(function t(){var e=document.getElementById("clk");if(e)e.textContent=new Date().toLocaleTimeString();setTimeout(t,1000);})();',
    'var F=1,AL=[];',
    'function sf(f){F=f;document.querySelectorAll(".fb").forEach(function(b){b.className="fb";});event.target.className="fb fon";rn();}',
    'function rn(){',
    '  var l=AL;',
    '  if(F===1)l=l.filter(function(a){return !a.dismissed;});',
    '  else if(F===2)l=AL;',
    '  else if(F===3)l=AL.filter(function(a){return a.type==="signoff"||a.type==="logout"||a.type==="shutdown";});',
    '  else if(F===4)l=AL.filter(function(a){return a.type==="blocked_site";});',
    '  else if(F===5)l=AL.filter(function(a){return a.type==="spoofed"||a.type==="spoof";});',
    '  else if(F===6)l=AL.filter(function(a){return a.type==="productivity";});',
    '  else if(F===7)l=AL.filter(function(a){return a.type==="away"||a.type==="locked";});',
    '  else if(F===8)l=AL.filter(function(a){return a.type==="message";});',
    '  var el=document.getElementById("alist");',
    '  if(!l.length){el.innerHTML="<div class=es>"+(F===1?"All clear - no active alerts":"No alerts here")+"</div>";return;}',
    '  el.innerHTML=l.map(function(a){',
    '    var isMsg=a.type==="message";',
    '    var isCpu=a.type==="high_cpu"||a.type==="high_ram";',
    '    var isR=!isMsg&&(a.type==="blocked_site"||a.type==="spoofed"||a.type==="spoof");',
    '    var isB=!isMsg&&(a.type==="signoff"||a.type==="logout"||a.type==="shutdown");',
    '    var cl=isMsg?"acmsg":isR?"acsp":isB?"acsl":"acaw";',
    '    var c=isMsg?"#2979ff":isCpu?"#ff3d57":isR?"#ff3d57":isB?"#2979ff":"#ffab00";',
    '    var ic=isMsg?"&#128172;":isCpu?"&#128293;":a.type==="blocked_site"?"&#128683;":a.type==="spoofed"?"&#9888;":"!";',
    '    var tm=new Date(a.ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});',
    '    var actions="";',
    '    if(a.dismissed){',
    '      actions="<span style=\\'font-size:10px;color:#4a6080\\'>Done</span>";',
    '    } else {',
    '      actions="<div class=acts>"',
    '        +"<button class=db data-id=\\'"+a.id+"\\' onclick=\\'dm(this)\\'>Acknowledge</button>";',
    '      if(isCpu)actions+="<button class=\\'db dbr\\' data-id=\\'"+a.id+"\\' data-host=\\'"+( a.hostname||"")+"\\' onclick=\\'killTopProc(this)\\'>Kill Process</button>";',
    '      if(isMsg)actions+="<button class=\\'db dbb\\' data-id=\\'"+a.id+"\\' data-host=\\'"+( a.hostname||"")+"\\' onclick=\\'replyMsg(this)\\'>Reply</button>";',
    '      actions+="</div>";',
    '    }',
    '    return "<div class=\\'ac "+cl+(a.dismissed?" acdis":"")+" \\' id=\\'al-"+a.id+"\\'>"+',
    '      "<div class=ai style=\\'color:"+c+"\\'>"+ic+"</div>"+',
    '      "<div class=ab>"+',
    '        "<div class=ah>"+(a.hostname||"?")+"</div>"+',
    '        "<div class=am>"+a.message+"</div>"+',
    '        "<div class=at>"+',
    '          "<span style=\\'padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;background:rgba(255,255,255,.08);color:"+c+"\\'>"+(a.type||"")+"</span>"+',
    '          "<span>"+tm+"</span>"+',
    '          (a.site?"<span style=color:#ff3d57>"+a.site+"</span>":"")+',
    '        "</div>"+',
    '      "</div>"+',
    '      actions+',
    '    "</div>";',
    '  }).join("");',
    '}',
    'function dm(btn){',
    '  var id=btn.getAttribute("data-id");',
    '  btn.textContent="...";btn.disabled=true;',
    '  fetch("/api/dismiss-alert",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id})}).then(function(){lo();});',
    '}',
    'function killTopProc(btn){',
    '  var host=btn.getAttribute("data-host");',
    '  var id=btn.getAttribute("data-id");',
    '  if(!confirm("Hard kill top CPU process on "+host+"?"))return;',
    '  btn.textContent="Killing...";btn.disabled=true;',
    '  fetch("/api/kill-top-proc",{method:"POST",headers:{"Content-Type":"application/json"},',
    '    body:JSON.stringify({hostname:host,alertId:id})})',
    '  .then(function(r){return r.json();}).then(function(d){',
    '    if(d.ok){btn.textContent="Killed";btn.style.color="#00e676";setTimeout(lo,1000);}',
    '    else{btn.textContent="Failed";btn.disabled=false;}',
    '  }).catch(function(){btn.textContent="Error";btn.disabled=false;});',
    '}',
    'function replyMsg(btn){',
    '  var host=btn.getAttribute("data-host");',
    '  var id=btn.getAttribute("data-id");',
    '  var card=document.getElementById("al-"+id);',
    '  var ex=card.querySelector(".reply-box");',
    '  if(ex){ex.remove();return;}',
    '  var box=document.createElement("div");box.className="reply-box";',
    '  var inp=document.createElement("input");',
    '  inp.type="text";inp.className="reply-inp";inp.maxLength=120;',
    '  inp.placeholder="Reply to "+host+"...";',
    '  var send=document.createElement("button");',
    '  send.className="db dbb";send.textContent="Send Reply";',
    '  send.onclick=function(){',
    '    var msg=(inp.value||"").trim();',
    '    if(!msg)return;',
    '    send.textContent="Sending...";send.disabled=true;',
    '    fetch("/api/boss-reply",{method:"POST",headers:{"Content-Type":"application/json"},',
    '      body:JSON.stringify({hostname:host,message:msg,alertId:id})})',
    '    .then(function(r){return r.json();}).then(function(d){',
    '      if(d.ok){',
    '        send.textContent="Sent!";send.style.color="#00e676";',
    '        var t2=document.createElement("div");',
    '        t2.style.cssText="position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#0d2045;color:#2979ff;border:1px solid rgba(41,121,255,.4);padding:10px 24px;border-radius:8px;font-size:12px;font-weight:700;z-index:9999";',
    '        t2.textContent="Reply sent to "+host;',
    '        document.body.appendChild(t2);',
    '        setTimeout(function(){t2.remove();},3000);',
    '        setTimeout(function(){box.remove();lo();},1500);',
    '      } else{send.textContent="Failed";send.disabled=false;}',
    '    }).catch(function(){send.textContent="Error";send.disabled=false;});',
    '  };',
    '  inp.onkeydown=function(e){if(e.key==="Enter")send.onclick();};',
    '  box.appendChild(inp);box.appendChild(send);',
    '  card.querySelector(".ab").appendChild(box);',
    '  setTimeout(function(){inp.focus();},50);',
    '}',
    'function lo(){',
    '  fetch("/api/alerts?all=1").then(function(r){return r.json();}).then(function(d){',
    '    AL=d;',
    '    var av=d.filter(function(a){return !a.dismissed;});',
    '    var cn={s:0,aw:0,p:0,sp:0,bl:0,msg:0};',
    '    av.forEach(function(a){',
    '      if(a.type==="signoff"||a.type==="logout"||a.type==="shutdown")cn.s++;',
    '      else if(a.type==="away"||a.type==="locked")cn.aw++;',
    '      else if(a.type==="productivity")cn.p++;',
    '      else if(a.type==="spoofed"||a.type==="spoof")cn.sp++;',
    '      else if(a.type==="blocked_site")cn.bl++;',
    '      else if(a.type==="message")cn.msg++;',
    '    });',
    '    document.getElementById("albl").textContent=av.length+" Active Alert"+(av.length!==1?"s":"")+" Today";',
    '    document.getElementById("stats").innerHTML=',
    '      "<div class=asbox><div class=asval>"+av.length+"</div><div class=aslbl>Active</div></div>"',
    '      +"<div class=asbox><div class=asval style=color:#2979ff>"+cn.s+"</div><div class=aslbl>Sign-offs</div></div>"',
    '      +"<div class=asbox><div class=asval style=color:#ffab00>"+cn.aw+"</div><div class=aslbl>Away</div></div>"',
    '      +"<div class=asbox><div class=asval style=color:#ffab00>"+cn.p+"</div><div class=aslbl>Low Prod</div></div>"',
    '      +"<div class=asbox><div class=asval style=color:#ff3d57>"+cn.sp+"</div><div class=aslbl>Spoof</div></div>"',
    '      +"<div class=asbox><div class=asval style=color:#ff3d57>"+cn.bl+"</div><div class=aslbl>Blocked</div></div>"',
    '      +"<div class=asbox><div class=asval style=color:#2979ff>"+cn.msg+"</div><div class=aslbl>Messages</div></div>";',
    '    rn();',
    '  }).catch(function(e){console.error(e);});',
    '}',
    'lo();setInterval(lo,10000);'
  ].join("\\n");

  return '<!DOCTYPE html><html><head><meta charset=UTF-8><style>'
    + css
    + '</style></head><body>'
    + header + nav
    + '<main>'
    + '<div><div class=lbl id=albl>Alerts</div><div class=astat id=stats></div></div>'
    + filters
    + '<div id=alist><div style="color:#4a6080;padding:40px;text-align:center">Loading...</div></div>'
    + '</main>'
    + '<footer>PromptAI Work+ v14.0 - Auto-refresh 10s</footer>'
    + '<script>' + js + '<' + '/script>'
    + '</body></html>';
}
module.exports = { alertsPage };
`;

fs.writeFileSync(alertsFile, newContent);
console.log('alerts.js patched successfully!');
console.log('Size:', fs.statSync(alertsFile).size, 'bytes');
