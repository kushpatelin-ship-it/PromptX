var http=require('http');
var os=require('os');
var ex=require('child_process').execSync;
var BOSS='192.168.12.93';
var PORT=4000;
var kw=['porn','pornhub','xxx','onlyfans','xvideos','chaturbate','nude','naked','xhamster','brazzers','redtube','cam4'];
var fired={};
function scan(){
  try{
    var out=ex('powershell -NoProfile -Command "Get-Process | Select-Object -ExpandProperty MainWindowTitle"',{timeout:2000,stdio:['ignore','pipe','ignore']}).toString();
    out.split('\n').forEach(function(title){
      title=title.trim();
      if(!title)return;
      kw.forEach(function(k){
        if(title.toLowerCase().indexOf(k)>=0){
          var key=k+new Date().getHours();
          if(fired[key])return;
          fired[key]=1;
          console.log('BLOCKED:',k,'in:',title);
          var p=JSON.stringify({type:'site_alert',hostname:os.hostname(),ts:new Date().toISOString(),state:'active',alerts:[{type:'blocked_site',category:'adult',site:k+'.com',keyword:k,title:title,message:'Inappropriate site: '+title,severity:'critical',ts:new Date().toISOString()}]});
          var r=http.request({hostname:BOSS,port:PORT,path:'/api/child-report',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(p)}},function(x){x.resume();console.log('Alert sent to boss!');});
          r.on('error',function(e){console.log('ERR:',e.message);});
          r.write(p);r.end();
        }
      });
    });
  }catch(e){}
}
console.log('Watching for blocked sites on port '+PORT+'...');
scan();
setInterval(scan,3000);
