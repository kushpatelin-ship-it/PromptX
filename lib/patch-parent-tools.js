'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');

var file = path.join(__dirname, '..', 'lib', 'parent.js');
var code = fs.readFileSync(file, 'utf8');

if (code.includes('DEFAULT_TOOLS')) {
  console.log('Tools already patched');
  process.exit(0);
}

// 1. Add tools store after _bossReplies
var toolsStore = `
// ── AI Tools store ────────────────────────────────────────────────────────────
const _fs = require('fs'), _path = require('path'), _os = require('os');
const TOOLS_FILE = _path.join(_os.homedir(), '.promptai-workplus', 'tools.json');
const DEFAULT_TOOLS = {
  engineering:[
    {id:'e1',name:'Claude',desc:'AI coding assistant for writing, debugging and explaining code.',url:'https://claude.ai',icon:'Robot',badge:'Recommended',enabled:true},
    {id:'e2',name:'GitHub Copilot',desc:'AI pair programmer in VS Code. Autocompletes code in real time.',url:'https://github.com/features/copilot',icon:'Laptop',badge:'Popular',enabled:true},
    {id:'e3',name:'Cursor',desc:'AI-first code editor. Chat with your codebase and generate features.',url:'https://cursor.sh',icon:'Lightning',badge:'Hot',enabled:true},
    {id:'e4',name:'Perplexity AI',desc:'AI search for researching docs, APIs and technical topics.',url:'https://perplexity.ai',icon:'Search',badge:'',enabled:true},
    {id:'e5',name:'v0 by Vercel',desc:'Generate React UI components from plain text descriptions.',url:'https://v0.dev',icon:'Palette',badge:'',enabled:true},
    {id:'e6',name:'Pieces for Devs',desc:'AI snippet manager. Save and find code snippets intelligently.',url:'https://pieces.app',icon:'Puzzle',badge:'',enabled:true},
  ],
  sales:[
    {id:'s1',name:'Claude',desc:'Write outreach emails, summarize calls and craft follow-up messages.',url:'https://claude.ai',icon:'Robot',badge:'Recommended',enabled:true},
    {id:'s2',name:'Apollo.io',desc:'AI prospecting - find leads and write personalized outreach at scale.',url:'https://apollo.io',icon:'Target',badge:'Popular',enabled:true},
    {id:'s3',name:'Lavender',desc:'AI email coach. Scores your cold emails and suggests improvements.',url:'https://lavender.ai',icon:'Email',badge:'Hot',enabled:true},
    {id:'s4',name:'Gong AI',desc:'Records and analyzes sales calls. Shows what top reps do differently.',url:'https://gong.io',icon:'Phone',badge:'',enabled:true},
    {id:'s5',name:'Notion AI',desc:'AI writing inside Notion. Summarize notes and draft proposals fast.',url:'https://notion.so',icon:'Notes',badge:'',enabled:true},
    {id:'s6',name:'ChatGPT',desc:'General AI for brainstorming, writing and research tasks.',url:'https://chatgpt.com',icon:'Chat',badge:'',enabled:true},
  ],
  operations:[
    {id:'o1',name:'Claude',desc:'Analyze data, summarize reports and automate documentation tasks.',url:'https://claude.ai',icon:'Robot',badge:'Recommended',enabled:true},
    {id:'o2',name:'Notion AI',desc:'AI writing in your workspace. Summarize meeting notes instantly.',url:'https://notion.so',icon:'Notes',badge:'Popular',enabled:true},
    {id:'o3',name:'Make',desc:'AI-enhanced automation. Connect apps and automate workflows visually.',url:'https://make.com',icon:'Gear',badge:'',enabled:true},
    {id:'o4',name:'Gamma',desc:'AI presentation maker. Turn bullet points into polished slides.',url:'https://gamma.app',icon:'Chart',badge:'Hot',enabled:true},
    {id:'o5',name:'Otter.ai',desc:'AI meeting transcription. Automatic notes and action items from calls.',url:'https://otter.ai',icon:'Mic',badge:'',enabled:true},
    {id:'o6',name:'ChatGPT',desc:'Draft SOPs, process docs and operational reports with AI.',url:'https://chatgpt.com',icon:'Chat',badge:'',enabled:true},
  ],
  support:[
    {id:'su1',name:'Claude',desc:'Draft support responses and explain technical issues in plain language.',url:'https://claude.ai',icon:'Robot',badge:'Recommended',enabled:true},
    {id:'su2',name:'Intercom Fin',desc:'AI agent that resolves support tickets automatically.',url:'https://intercom.com',icon:'Headset',badge:'Popular',enabled:true},
    {id:'su3',name:'Notion AI',desc:'Build and maintain your knowledge base with AI-assisted writing.',url:'https://notion.so',icon:'Notes',badge:'',enabled:true},
    {id:'su4',name:'Otter.ai',desc:'Transcribe support calls automatically. Never miss an action item.',url:'https://otter.ai',icon:'Mic',badge:'',enabled:true},
    {id:'su5',name:'ChatGPT',desc:'Research answers to complex customer questions quickly.',url:'https://chatgpt.com',icon:'Chat',badge:'',enabled:true},
    {id:'su6',name:'Grammarly',desc:'AI writing assistant. Make every support reply clear and professional.',url:'https://grammarly.com',icon:'Pencil',badge:'',enabled:true},
  ],
  executive:[
    {id:'ex1',name:'Claude',desc:'Strategic analysis, document drafting and executive briefings.',url:'https://claude.ai',icon:'Robot',badge:'Recommended',enabled:true},
    {id:'ex2',name:'Perplexity AI',desc:'AI research engine. Get sourced answers to complex business questions.',url:'https://perplexity.ai',icon:'Search',badge:'Popular',enabled:true},
    {id:'ex3',name:'Gamma',desc:'AI-generated presentations. Create board decks from bullet points.',url:'https://gamma.app',icon:'Chart',badge:'Hot',enabled:true},
    {id:'ex4',name:'Otter.ai',desc:'AI meeting notes. Capture decisions and action items automatically.',url:'https://otter.ai',icon:'Mic',badge:'',enabled:true},
    {id:'ex5',name:'ChatGPT',desc:'General AI for research, writing and strategic thinking.',url:'https://chatgpt.com',icon:'Chat',badge:'',enabled:true},
    {id:'ex6',name:'Notion AI',desc:'AI workspace for managing projects, docs and team updates.',url:'https://notion.so',icon:'Notes',badge:'',enabled:true},
  ],
  marketing:[
    {id:'m1',name:'Claude',desc:'Write copy, brainstorm campaigns and analyze marketing data.',url:'https://claude.ai',icon:'Robot',badge:'Recommended',enabled:true},
    {id:'m2',name:'Jasper AI',desc:'AI marketing copy writer. Generate ads, emails and social posts.',url:'https://jasper.ai',icon:'Pen',badge:'Popular',enabled:true},
    {id:'m3',name:'Canva AI',desc:'AI design tools. Create graphics, presentations and social content.',url:'https://canva.com',icon:'Palette',badge:'Hot',enabled:true},
    {id:'m4',name:'Surfer SEO',desc:'AI SEO optimization. Write content that ranks on Google.',url:'https://surferseo.com',icon:'Chart',badge:'',enabled:true},
    {id:'m5',name:'Hootsuite AI',desc:'AI social media management. Schedule and optimize posts.',url:'https://hootsuite.com',icon:'Phone',badge:'',enabled:true},
    {id:'m6',name:'ChatGPT',desc:'General AI for brainstorming, writing and creative tasks.',url:'https://chatgpt.com',icon:'Chat',badge:'',enabled:true},
  ],
};
let _toolsStore = null;
function loadTools() {
  if (_toolsStore) return _toolsStore;
  try { if (_fs.existsSync(TOOLS_FILE)) _toolsStore = JSON.parse(_fs.readFileSync(TOOLS_FILE,'utf8')); } catch(_) {}
  if (!_toolsStore) _toolsStore = JSON.parse(JSON.stringify(DEFAULT_TOOLS));
  return _toolsStore;
}
function saveTools() {
  try { _fs.mkdirSync(_path.dirname(TOOLS_FILE),{recursive:true}); _fs.writeFileSync(TOOLS_FILE, JSON.stringify(_toolsStore,null,2)); } catch(e) {}
}`;

// 2. Add /api/tools and /api/messages to allowed employee APIs
code = code.replace(
  "'/api/privacy-mode'].includes(url)",
  "'/api/privacy-mode','/api/tools','/api/messages'].includes(url)"
);

// 3. Add tools store before module.exports
var insertBefore = 'module.exports = {start};';
if (!code.includes(insertBefore)) insertBefore = 'module.exports={start};';
code = code.replace(insertBefore, toolsStore + '\n' + insertBefore);

// 4. Add /api/tools and /api/messages routes and /tools page route
var apiRoute = `
    // ── AI Tools API ─────────────────────────────────────────────────────────
    if (url==='/api/tools') {
      const qs_t=Object.fromEntries(new URLSearchParams((req.url||'').split('?')[1]||''));
      const dept_t=qs_t.dept||'engineering';
      const tools_t=loadTools();
      if(req.method==='GET'){
        const showAll=qs_t.all==='1'&&_ownIPs.has(clientIp);
        const deptTools=(tools_t[dept_t]||[]).filter(t=>showAll||t.enabled!==false);
        return json(res,200,{dept:dept_t,tools:deptTools});
      }
      if(req.method==='POST'&&_ownIPs.has(clientIp)){
        let b='';req.on('data',c=>b+=c);req.on('end',()=>{
          try{
            const d=JSON.parse(b||'{}');const t=loadTools();
            if(!t[dept_t])t[dept_t]=[];
            if(d.action==='add'){const nt={id:dept_t[0]+Date.now().toString(36),name:d.name||'New',desc:d.desc||'',url:d.url||'#',icon:d.icon||'Tool',badge:d.badge||'',enabled:true};t[dept_t].push(nt);_toolsStore=t;saveTools();return json(res,200,{ok:true,tool:nt});}
            if(d.action==='edit'){const idx=t[dept_t].findIndex(x=>x.id===d.id);if(idx>=0){t[dept_t][idx]={...t[dept_t][idx],name:d.name||t[dept_t][idx].name,url:d.url||t[dept_t][idx].url,desc:d.desc!==undefined?d.desc:t[dept_t][idx].desc,icon:d.icon||t[dept_t][idx].icon,badge:d.badge!==undefined?d.badge:t[dept_t][idx].badge};}_toolsStore=t;saveTools();return json(res,200,{ok:true});}
            if(d.action==='delete'){t[dept_t]=t[dept_t].filter(x=>x.id!==d.id);_toolsStore=t;saveTools();return json(res,200,{ok:true});}
            if(d.action==='toggle'){const idx=t[dept_t].findIndex(x=>x.id===d.id);if(idx>=0)t[dept_t][idx].enabled=!t[dept_t][idx].enabled;_toolsStore=t;saveTools();return json(res,200,{ok:true});}
            if(d.action==='reset'){t[dept_t]=JSON.parse(JSON.stringify(DEFAULT_TOOLS[dept_t]||[]));_toolsStore=t;saveTools();return json(res,200,{ok:true});}
            return json(res,400,{ok:false,error:'Unknown action'});
          }catch(e){return json(res,500,{ok:false,error:e.message});}
        });return;
      }
    }

    // ── Message threads ───────────────────────────────────────────────────────
    if (!_threads) _threads={};
    function _threadGet2(h){if(!_threads[h])_threads[h]=[];return _threads[h];}
    if (url==='/api/messages') {
      const qs_m=Object.fromEntries(new URLSearchParams((req.url||'').split('?')[1]||''));
      let mHost=qs_m.host||'';
      if(!mHost||mHost===clientIp){const byIp=Array.from(reg.values()).find(e=>e.ip===clientIp);if(byIp&&byIp.hostname)mHost=byIp.hostname;else mHost=qs_m.host||clientIp;}
      if(req.method==='GET'){return json(res,200,{messages:_threadGet2(mHost),hostname:mHost});}
      if(req.method==='POST'){let b='';req.on('data',c=>b+=c);req.on('end',()=>{
        try{
          const d=JSON.parse(b||'{}');const msg=(d.message||'').trim();
          if(!msg)return json(res,400,{ok:false,error:'empty'});
          const from=_ownIPs.has(clientIp)?'Boss':mHost;
          const m={id:Date.now().toString(36)+Math.random().toString(36).slice(2,4),from,message:msg,ts:new Date().toISOString()};
          _threadGet2(mHost).push(m);
          if(!_ownIPs.has(clientIp)){store.addAlert({id:'msg-'+m.id,ts:m.ts,type:'message',hostname:mHost,message:'Message from '+mHost+': '+msg,severity:'info',dismissed:false});}
          return json(res,200,{ok:true,msg:m});
        }catch(e){return json(res,500,{ok:false,error:e.message});}
      });return;}
    }
`;

// Find good injection point
var injectPoint = "    if (req.method==='POST'&&url==='/api/dismiss-alert') {";
if (code.includes(injectPoint)) {
  code = code.replace(injectPoint, apiRoute + '\n    ' + injectPoint.trim());
  console.log('API routes injected');
} else {
  console.log('WARNING: Could not find dismiss-alert injection point');
}

// 5. Add /tools HTML route
var toolsHtmlRoute = "    if(url==='/tools'){res.writeHead(200,{'Content-Type':H});return res.end(dash.toolsPage());}\n";
var alertsHtmlRoute = code.match(/if\(url===.\/alerts.\)/);
if (alertsHtmlRoute && !code.includes('/tools')) {
  code = code.replace(alertsHtmlRoute[0], toolsHtmlRoute + '    ' + alertsHtmlRoute[0]);
  console.log('HTML /tools route added');
}

fs.writeFileSync(file, code);
console.log('DONE - parent.js patched, size:', fs.statSync(file).size);
