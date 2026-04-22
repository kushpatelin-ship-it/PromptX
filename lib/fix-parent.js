'use strict';
var fs = require('fs');
var path = require('path');
var file = path.join(__dirname, '..', 'lib', 'parent.js');
var code = fs.readFileSync(file, 'utf8');

// Check if module.exports exists
if (code.includes('module.exports')) {
  console.log('module.exports already present');
} else {
  code = code + '\nmodule.exports = {start};\n';
  console.log('Added module.exports');
}

// Add _threads if missing
if (!code.includes('_threads')) {
  code = code.replace(
    "let _bossReplies = {};",
    "let _bossReplies = {};\nlet _threads = {};\nfunction _threadGet(h){ if(!_threads[h])_threads[h]=[]; return _threads[h]; }\nfunction _threadPost(h,from,msg){\n  const t=_threadGet(h);\n  const m={id:Date.now().toString(36)+Math.random().toString(36).slice(2,4),from,message:msg,ts:new Date().toISOString()};\n  t.push(m); if(t.length>100)_threads[h]=t.slice(-100);\n  return m;\n}"
  );
  console.log('Added _threads store');
}

// Add /api/messages to allowed APIs
if (!code.includes("'/api/messages'")) {
  code = code.replace(
    "'/api/privacy-mode'].includes(url)",
    "'/api/privacy-mode','/api/messages'].includes(url)"
  );
  console.log('Added /api/messages to allowed');
}

// Add /api/messages route
if (!code.includes("url==='/api/messages'")) {
  var route = "    if (url==='/api/messages') {\n      const qs2=Object.fromEntries(new URLSearchParams((req.url||'').split('?')[1]||''));\n      let mHost=qs2.host||'';\n      if(!mHost||mHost===clientIp){const byIp=Array.from(reg.values()).find(e=>e.ip===clientIp);if(byIp&&byIp.hostname)mHost=byIp.hostname;else mHost=qs2.host||clientIp;}\n      if(req.method==='GET'){return json(res,200,{messages:_threadGet(mHost),hostname:mHost});}\n      if(req.method==='POST'){let b='';req.on('data',c=>b+=c);req.on('end',()=>{\n        try{\n          const d=JSON.parse(b||'{}');const msg=(d.message||'').trim();\n          if(!msg)return json(res,400,{ok:false,error:'empty'});\n          const from=_ownIPs.has(clientIp)?'Boss':mHost;\n          const m=_threadPost(mHost,from,msg);\n          if(!_ownIPs.has(clientIp)){store.addAlert({id:'msg-'+m.id,ts:m.ts,type:'message',hostname:mHost,message:'Message from '+mHost+': '+msg,severity:'info',dismissed:false});}\n          return json(res,200,{ok:true,msg:m});\n        }catch(e){return json(res,500,{ok:false,error:e.message});}\n      });return;}\n    }\n\n";
  code = code.replace(
    "    if (req.method==='POST'&&url==='/api/dismiss-alert') {",
    route + "    if (req.method==='POST'&&url==='/api/dismiss-alert') {"
  );
  console.log('Added /api/messages route');
}

fs.writeFileSync(file, code);
console.log('DONE - parent.js fixed, size:', fs.statSync(file).size);
