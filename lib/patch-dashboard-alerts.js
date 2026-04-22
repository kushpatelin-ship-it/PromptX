'use strict';
var fs = require('fs');
var path = require('path');

var file = path.join(__dirname, '..', 'ui', 'dashboard.js');
var code = fs.readFileSync(file, 'utf8');

// Remove old patch if present
if (code.includes('pollAlerts')) {
  var s = code.indexOf("j+='var _seenAlertIds=");
  var e = code.indexOf("setInterval(pollAlerts,10000);},2000);';") + "setInterval(pollAlerts,10000);},2000);';".length;
  if (s > 0 && e > s) { code = code.slice(0, s) + code.slice(e); console.log('Removed old patch'); }
}

var INJECT = "j+='setInterval(function(){lbc(\"bm\");},10000);';";
if (!code.includes(INJECT)) { console.log('ERROR: injection point not found'); process.exit(1); }

var PATCH = "\n" + [
  "j+='var _seenIds={};';",

  // pollAlerts - simple, no age filter
  "j+='function pollAlerts(){fetch(\"/api/alerts\").then(function(r){return r.json();}).then(function(al){al.forEach(function(a){if(a.dismissed||_seenIds[a.id])return;_seenIds[a.id]=true;showMsgBanner(a);});}).catch(function(){});}';",

  // showMsgBanner - shows alert with thread chat
  "j+='function showMsgBanner(a){';",
  "j+='  var isMsg=a.type===\"message\";';",
  "j+='  var col=isMsg?\"#2979ff\":a.type===\"high_cpu\"||a.type===\"high_ram\"?\"#ff3d57\":\"#ffab00\";';",
  "j+='  var wrap=document.getElementById(\"alert-wrap\");';",
  "j+='  if(!wrap){wrap=document.createElement(\"div\");wrap.id=\"alert-wrap\";wrap.style.cssText=\"position:fixed;top:64px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:9500;width:340px\";document.body.appendChild(wrap);}';",
  "j+='  var card=document.createElement(\"div\");';",
  "j+='  card.style.cssText=\"background:#0d1420;border-left:4px solid \"+col+\";border-radius:10px;padding:16px;box-shadow:0 4px 24px rgba(0,0,0,.6);border:1px solid \"+col+\"44\";';",
  // header
  "j+='  var hdr=document.createElement(\"div\");hdr.style.cssText=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\";';",
  "j+='  var htxt=document.createElement(\"div\");htxt.style.cssText=\"font-size:12px;font-weight:700;color:#fff\";htxt.textContent=(isMsg?\"\\uD83D\\uDCAC \":\"\\u26A0 \")+(a.hostname||\"?\")+\" \\u00B7 \"+new Date(a.ts).toLocaleTimeString([],{hour:\"2-digit\",minute:\"2-digit\"});';",
  "j+='  var cls=document.createElement(\"button\");cls.textContent=\"\\u00D7\";cls.style.cssText=\"background:none;border:none;color:#4a6080;font-size:16px;cursor:pointer;padding:0 4px\";cls.onclick=function(){card.remove();};';",
  "j+='  hdr.appendChild(htxt);hdr.appendChild(cls);';",
  // message
  "j+='  var mg=document.createElement(\"div\");mg.style.cssText=\"font-size:12px;color:#ccd6f0;margin-bottom:10px;line-height:1.5\";mg.textContent=a.message;';",
  // thread area (only for messages)
  "j+='  if(isMsg){';",
  "j+='    var aHn=a.hostname;';",
  "j+='    var thread=document.createElement(\"div\");thread.style.cssText=\"max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:6px;background:#070a10;border-radius:6px\";';",
  "j+='    function loadThread(){fetch(\"/api/messages?host=\"+encodeURIComponent(aHn)).then(function(r){return r.json();}).then(function(d){var msgs=d.messages||[];thread.innerHTML=\"\";msgs.slice(-10).forEach(function(m){var row=document.createElement(\"div\");var isBoss=m.from===\"Boss\";row.style.cssText=\"display:flex;flex-direction:column;align-items:\"+(isBoss?\"flex-end\":\"flex-start\");var bubble=document.createElement(\"div\");bubble.style.cssText=\"max-width:85%;padding:5px 10px;border-radius:8px;font-size:11px;line-height:1.4;background:\"+(isBoss?\"rgba(41,121,255,.2)\":\"rgba(255,255,255,.06)\")+\";color:#fff;margin-bottom:2px\";bubble.textContent=m.message;var lbl=document.createElement(\"div\");lbl.style.cssText=\"font-size:9px;color:#4a6080;margin-bottom:4px\";lbl.textContent=(isBoss?\"Boss\":aHn)+\" \"+new Date(m.ts).toLocaleTimeString([],{hour:\"2-digit\",minute:\"2-digit\"});row.appendChild(lbl);row.appendChild(bubble);thread.appendChild(row);});thread.scrollTop=thread.scrollHeight;}).catch(function(){});}';",
  "j+='    loadThread();setInterval(loadThread,5000);';",
  // reply input
  "j+='    var inp=document.createElement(\"input\");inp.type=\"text\";inp.maxLength=120;inp.placeholder=\"Reply to \"+aHn+\"...\";inp.style.cssText=\"width:100%;padding:7px 10px;border-radius:6px;background:#111825;border:1px solid #1a2332;color:#ccd6f0;font-size:11px;outline:none;box-sizing:border-box;margin-bottom:6px\";';",
  "j+='    var btns=document.createElement(\"div\");btns.style.cssText=\"display:flex;gap:6px\";';",
  "j+='    var snd=document.createElement(\"button\");snd.textContent=\"Send\";snd.style.cssText=\"flex:1;padding:7px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(41,121,255,.15);color:#2979ff;border:1px solid rgba(41,121,255,.3);cursor:pointer\";';",
  "j+='    snd.onclick=function(){var txt=(inp.value||\"\").trim();if(!txt)return;inp.value=\"\";try{fetch(\"/api/messages?host=\"+encodeURIComponent(aHn),{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({message:txt})}).then(function(){loadThread();});}catch(x){}};';",
  "j+='    inp.onkeydown=function(e){if(e.key===\"Enter\")snd.onclick();};';",
  "j+='    var ack=document.createElement(\"button\");ack.textContent=\"Dismiss\";ack.style.cssText=\"padding:7px 12px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(255,255,255,.04);color:#4a6080;border:1px solid #1a2332;cursor:pointer\";';",
  "j+='    ack.onclick=function(){fetch(\"/api/dismiss-alert\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({id:a.id})});card.remove();};';",
  "j+='    btns.appendChild(snd);btns.appendChild(ack);';",
  "j+='    card.appendChild(hdr);card.appendChild(mg);card.appendChild(thread);card.appendChild(inp);card.appendChild(btns);';",
  "j+='  } else {';",
  // non-message alerts - just ack button
  "j+='    var ack2=document.createElement(\"button\");ack2.textContent=\"Acknowledge\";ack2.style.cssText=\"padding:6px 14px;border-radius:6px;font-size:10px;font-weight:700;background:rgba(255,255,255,.05);color:#4a6080;border:1px solid #1a2332;cursor:pointer\";';",
  "j+='    ack2.onclick=function(){fetch(\"/api/dismiss-alert\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({id:a.id})});card.remove();};';",
  "j+='    card.appendChild(hdr);card.appendChild(mg);card.appendChild(ack2);';",
  "j+='    setTimeout(function(){if(card.parentNode)card.remove();},20000);';",
  "j+='  }';",
  "j+='  wrap.insertBefore(card,wrap.firstChild);if(wrap.children.length>4)wrap.removeChild(wrap.lastChild);';",
  "j+='}';",
  "j+='setTimeout(function(){pollAlerts();setInterval(pollAlerts,10000);},1000);';"
].map(function(l){ return "       " + l; }).join("\n");

code = code.replace(INJECT, INJECT + PATCH);
fs.writeFileSync(file, code);
console.log('DONE - messaging system injected');
console.log('Size:', fs.statSync(file).size, 'bytes');
