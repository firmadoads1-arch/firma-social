import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
const bundle=await build({entryPoints:['lib/prisma/engine-watchdog.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {protectEngine}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const limits={io:20,probe:20,firstFrame:30,idle:70,total:300};
const pending=()=>new Promise(()=>{});
const fake=()=>({loaded:true,terminated:false,handlers:[],on(name,fn){this.handlers.push(fn);},terminate(){this.terminated=true;this.loaded=false;},writeFile:pending,readFile:pending,deleteFile:async()=>true,ffprobe:pending,exec:pending});
for(const method of ['writeFile','readFile','ffprobe','exec']){
 const ff=fake();protectEngine(ff,true,limits);
 await assert.rejects(()=>ff[method](),error=>error.name==='EngineCommandError'&&error.accelerated);
 assert.equal(ff.terminated,true,'external deadline must terminate a silent worker');
}
const active=fake();active.exec=async()=>{await new Promise(resolve=>setTimeout(resolve,20));active.handlers.forEach(fn=>fn({time:1,progress:.1}));await new Promise(resolve=>setTimeout(resolve,45));return 0;};
protectEngine(active,false,limits);assert.equal(await active.exec(),0);assert.equal(active.terminated,false);
const stopped=fake();stopped.exec=()=>{const timer=setInterval(()=>stopped.handlers.forEach(fn=>fn({time:0,progress:0})),5);setTimeout(()=>clearInterval(timer),50);return pending();};protectEngine(stopped,true,limits);
await assert.rejects(()=>stopped.exec(),/parou de responder/);assert.equal(stopped.terminated,true);
console.log('PASS external deadlines for file I/O, probe and render; progressing work survives; repeated zero progress cannot hide a stall');
