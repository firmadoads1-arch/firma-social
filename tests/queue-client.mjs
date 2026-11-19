// Executes the actual dashboard effect with a hidden tab, scoped workspace and
// fake HTTP/timers. All posting requests are mocked; no platform is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
const dir=fs.mkdtempSync(path.join(tmpdir(),'queue-client-'));fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'dir');
const real={setInterval,clearInterval,fetch,now:Date.now};
try{
 const out=path.join(dir,'dashboard.mjs');
 await build({entryPoints:['app/dashboard.tsx'],outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'root-effects-fixture',setup(b){b.onLoad({filter:/app\/dashboard\.tsx$/},({path:p})=>({contents:fs.readFileSync(p,'utf8').replace('import {useEffect,useRef','import {useRef').replace(' function openPost(', ' globalThis.__manualQueue=runQueue;\n function openPost(').replace("'use client';","'use client';\nconst useEffect=(fn)=>globalThis.__queueEffects.push(fn);"),loader:'tsx',resolveDir:path.dirname(p)}));}}]});
 const {default:Dashboard}=await import(pathToFileURL(out));
 const state={groupId:'empty-group',groups:[{id:'empty-group',name:'Outro grupo'}],posts:[],accounts:[],media:[],deliveries:[],rules:[],templates:[],events:[],referenceProfiles:[],referenceModels:[],referenceMedia:[],workspace:{name:'Teste',timezone:'America/Sao_Paulo'},providers:Object.fromEntries(['instagram','youtube','tiktok'].map(p=>[p,{configured:true,callback:''}])),scheduler:{enabled:true,healthy:true,delayedCount:0},userName:'QA'};
 async function scenario(mode){
  const intervals=new Map(),listeners=new Map(),calls=[];let time=Date.parse('2026-11-13T18:00:00Z'),receipt='before';
  Date.now=()=>time;globalThis.__queueEffects=[];
  globalThis.location={search:''};globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
  const add=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},remove=(type,fn)=>listeners.get(type)?.delete(fn);
  globalThis.window={addEventListener:add,removeEventListener:remove};globalThis.document={visibilityState:'hidden',addEventListener:add,removeEventListener:remove};
  globalThis.setInterval=(fn,ms)=>{const id=Symbol();intervals.set(id,{fn,ms});return id;};globalThis.clearInterval=id=>intervals.delete(id);
  globalThis.fetch=async(url,options={})=>{
   const method=options.method??'GET';calls.push({url,method});
   if(String(url).startsWith('/api/app'))return Response.json(state);
   assert.equal(url,'/api/runner');
   if(method==='POST'){if(mode==='unknown')throw Error('unknown response');receipt='confirmed';return Response.json({processed:1,drafted:0,checkedAt:receipt});}
   return Response.json({lastRun:{checkedAt:mode==='mismatch'&&receipt==='confirmed'?'another-run':receipt},queue:{pending:31,processing:0,working:0,nextCheckAt:['future','manualFuture'].includes(mode)?time+3600000:time-1}});
  };
  renderToStaticMarkup(React.createElement(Dashboard,{initial:state,initialView:'overview'}));
  const cleanups=globalThis.__queueEffects.map(fn=>fn()).filter(fn=>typeof fn==='function');
  const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};await flush();
  const posts=()=>calls.filter(c=>c.method==='POST').length;
  if(mode==='manualFuture'){await globalThis.__manualQueue();await flush();}
  const first=posts();time+=16000;for(const item of intervals.values())if(item.ms===15000)await item.fn();await flush();const second=posts();
  for(const cleanup of cleanups)cleanup();assert.equal(intervals.size,0);assert([...listeners.values()].every(s=>s.size===0));
  return {first,second};
 }
 assert.deepEqual(await scenario('normal'),{first:1,second:2},'Hidden tab and a group with no local posts must still process approved work in the global queue');
 assert.deepEqual(await scenario('future'),{first:0,second:0},'Future work must not be forced');
 assert.deepEqual(await scenario('manualFuture'),{first:0,second:0},'Manual verification must respect the persisted next eligible time');
 assert.deepEqual(await scenario('unknown'),{first:1,second:1},'A lost POST response must pause without automatic replay');
 assert.deepEqual(await scenario('mismatch'),{first:1,second:1},'An unconfirmed heartbeat must pause without automatic replay');
 const client=path.join(dir,'runner-client.mjs');await build({entryPoints:['lib/runner-client.ts'],outfile:client,bundle:true,format:'esm',platform:'node'});const {runnerRequest}=await import(pathToFileURL(client));let attempts=0,signal;globalThis.fetch=async(_url,init)=>{attempts++;signal=init.signal;return new Promise(()=>{});};await assert.rejects(runnerRequest('/api/runner',{method:'POST',body:'{}'},15),/demorou/);assert.equal(attempts,1);assert.equal(signal.aborted,true);
 console.log('PASS dashboard: global queue works with hidden/scoped tabs, future work waits, uncertain requests stop, and timers/listeners clean up.');
}finally{globalThis.setInterval=real.setInterval;globalThis.clearInterval=real.clearInterval;globalThis.fetch=real.fetch;Date.now=real.now;fs.rmSync(dir,{recursive:true,force:true});}
