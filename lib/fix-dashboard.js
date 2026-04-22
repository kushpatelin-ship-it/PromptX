'use strict';
var fs = require('fs');
var path = require('path');

var file = path.join(__dirname, '..', 'ui', 'dashboard.js');
var code = fs.readFileSync(file, 'utf8');

// Find and remove ALL old patch attempts - search for the broken comment line
var broken = "// \u2500\u2500 Real-time alert banners \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500";

// Find injection point
var INJECT = "j+='setInterval(function(){lbc(\"bm\");},10000);';";
var injectIdx = code.indexOf(INJECT);
if (injectIdx < 0) { console.log('ERROR: injection point not found'); process.exit(1); }

// Find where the patch starts (right after injection point)
var patchStart = injectIdx + INJECT.length;

// Find end of patch - look for the next major section
var nextSection = code.indexOf("\n       j+='setTimeout(function(){_warmAll();", patchStart);
if (nextSection < 0) nextSection = code.indexOf("\n       j+='function lePoll()", patchStart);
if (nextSection < 0) nextSection = code.indexOf("\nfunction childrenPage()", patchStart);

if (nextSection < 0) {
  console.log('Cannot find end of patch - will try to remove by line count');
  // Just find everything between inject point and the next j+= that we know is good
  nextSection = code.indexOf("j+='setTimeout(function(){_warmAll()", patchStart);
}

if (nextSection > patchStart) {
  var removed = code.slice(patchStart, nextSection);
  console.log('Removing', removed.split('\n').length, 'lines of old patch');
  code = code.slice(0, patchStart) + '\n' + code.slice(nextSection);
}

// Now inject clean patch
var PATCH = "\n" + [
  "       j+='var _seenIds={};';",
  "       j+='function pollAlerts(){fetch(\"/api/alerts\").then(function(r){return r.json();}).then(function(al){al.forEach(function(a){if(a.dismissed||_seenIds[a.id])return;_seenIds[a.id]=true;showMsgBanner(a);});}).catch(function(){});}';",
  "       j+='function showMsgBanner(a){var isMsg=a.type===\"message\";var col=isMsg?\"#2979ff\":\"#ffab00\";var wrap=document.getElementById(\"aw\");if(!wrap){wrap=document.createElement(\"div\");wrap.id=\"aw\";wrap.style.cssText=\"position:fixed;top:64px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:9500;width:340px\";document.body.appendChild(wrap);}var card=document.createElement(\"div\");card.style.cssText=\"background:#0d1420;border-left:4px solid \"+col+\";border-radius:10px;padding:16px;box-shadow:0 4px 24px rgba(0,0,0,.6);border:1px solid \"+col+\"44\";var hdr=document.createElement(\"div\");hdr.style.cssText=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\";var htxt=document.createElement(\"div\");htxt.style.cssText=\"font-size:12px;font-weight:700;color:#fff\";htxt.textContent=(isMsg?\"\\uD83D\\uDCAC \":\"\\u26A0 \")+(a.hostname||\"?\")+\" \\u00B7 \"+new Date(a.ts).toLocaleTimeString([],{hour:\"2-digit\",minute:\"2-digit\"});var cls=document.createElement(\"button\");cls.textContent=\"\\u00D7\";cls.style.cssText=\"background:none;border:none;color:#4a6080;font-size:16px;cursor:pointer;padding:0 4px\";cls.onclick=function(){card.remove();};hdr.appendChild(htxt);hdr.appendChild(cls);var mg=document.createElement(\"div\");mg.style.cssText=\"font-size:12px;color:#ccd6f0;margin-bottom:10px;line-height:1.5\";mg.textContent=a.message;if(isMsg){var aHn=a.hostname;var thread=document.createElement(\"div\");thread.style.cssText=\"max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:6px;background:#070a10;border-radius:6px\";function loadTh(){fetch(\"/api/messages?host=\"+encodeURIComponent(aHn)).then(function(r){return r.json();}).then(function(d){var msgs=d.messages||[];thread.innerHTML=\"\";msgs.slice(-10).forEach(function(m){var row=document.createElement(\"div\");var isBoss=m.from===\"Boss\";row.style.cssText=\"display:flex;flex-direction:column;align-items:\"+(isBoss?\"flex-end\":\"flex-start\");var bubble=document.createElement(\"div\");bubble.style.cssText=\"max-width:85%;padding:5px 10px;border-radius:8px;font-size:11px;background:\"+(isBoss?\"rgba(41,121,255,.2)\":\"rgba(255,255,255,.06)\")+\";color:#fff;margin-bottom:2px\";bubble.textContent=m.message;var lbl=document.createElement(\"div\");lbl.style.cssText=\"font-size:9px;color:#4a6080;margin-bottom:4px\";lbl.textContent=(isBoss?\"Boss\":aHn)+\" \"+new Date(m.ts).toLocaleTimeString([],{hour:\"2-digit\",minute:\"2-digit\"});row.appendChild(lbl);row.appendChild(bubble);thread.appendChild(row);});thread.scrollTop=thread.scrollHeight;}).catch(function(){});}loadTh();setInterval(loadTh,5000);var inp=document.createElement(\"input\");inp.type=\"text\";inp.maxLength=120;inp.placeholder=\"Reply to \"+aHn+\"...\";inp.style.cssText=\"width:100%;padding:7px 10px;border-radius:6px;background:#111825;border:1px solid #1a2332;color:#ccd6f0;font-size:11px;outline:none;box-sizing:border-box;margin-bottom:6px\";var btns=document.createElement(\"div\");btns.style.cssText=\"display:flex;gap:6px\";var snd=document.createElement(\"button\");snd.textContent=\"Send\";snd.style.cssText=\"flex:1;padding:7px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(41,121,255,.15);color:#2979ff;border:1px solid rgba(41,121,255,.3);cursor:pointer\";snd.onclick=function(){var txt=(inp.value||\"\").trim();if(!txt)return;inp.value=\"\";try{fetch(\"/api/messages?host=\"+encodeURIComponent(aHn),{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({message:txt})).then(function(){loadTh();});}catch(x){}};inp.onkeydown=function(e){if(e.key===\"Enter\")snd.onclick();};var ack=document.createElement(\"button\");ack.textContent=\"Dismiss\";ack.style.cssText=\"padding:7px 12px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(255,255,255,.04);color:#4a6080;border:1px solid #1a2332;cursor:pointer\";ack.onclick=function(){try{fetch(\"/api/dismiss-alert\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({id:a.id})});}catch(x){}card.remove();};btns.appendChild(snd);btns.appendChild(ack);card.appendChild(hdr);card.appendChild(mg);card.appendChild(thread);card.appendChild(inp);card.appendChild(btns);}else{var ack2=document.createElement(\"button\");ack2.textContent=\"Acknowledge\";ack2.style.cssText=\"padding:6px 14px;border-radius:6px;font-size:10px;font-weight:700;background:rgba(255,255,255,.05);color:#4a6080;border:1px solid #1a2332;cursor:pointer\";ack2.onclick=function(){try{fetch(\"/api/dismiss-alert\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({id:a.id})});}catch(x){}card.remove();};card.appendChild(hdr);card.appendChild(mg);card.appendChild(ack2);setTimeout(function(){if(card.parentNode)card.remove();},20000);}wrap.insertBefore(card,wrap.firstChild);if(wrap.children.length>4)wrap.removeChild(wrap.lastChild);}';",
  "       j+='setTimeout(function(){pollAlerts();setInterval(pollAlerts,10000);},1000);';"
].join("\n");

code = code.slice(0, patchStart) + PATCH + '\n' + code.slice(patchStart + 1);

fs.writeFileSync(file, code);
console.log('DONE - clean patch applied, size:', fs.statSync(file).size);
