// Regression for cancelling a download/worker load then immediately starting again.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
let chunkCount=0,pendingLoad=null;const chunkStarted=defer(),firstChunk=defer(),instances=[];
globalThis.location={origin:'https://prisma.test'};
globalThis.fetch=async path=>{
 if(path.split('?')[0]==='/prisma-engine/manifest.json')return new Response(JSON.stringify({chunks:['core-0.bin'],bytes:8}));
 chunkCount++;if(chunkCount===1){chunkStarted.resolve();return firstChunk.promise;}
 return new Response(new Uint8Array([0,97,115,109,1,0,0,0]));
};
class FFmpeg{
 loaded=false;terminated=false;
 constructor(){instances.push(this);}
 on(){}
 async load(){if(pendingLoad){const wait=pendingLoad;pendingLoad=null;wait.started.resolve();await wait.promise;}this.loaded=true;}
 terminate(){this.loaded=false;this.terminated=true;}
}
globalThis.__cancelFFmpeg=FFmpeg;
const bundle=await build({stdin:{contents:"export {loadEngine,cancelEngine} from './lib/prisma/media.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fake-worker-module',setup(b){b.onLoad({filter:/lib\/prisma\/media\.ts$/},({path})=>{let source=fs.readFileSync(path,'utf8');source=source.replace("import(/* @vite-ignore */ (location.origin+'/prisma-engine/ffmpeg-r2/index.js'))","Promise.resolve({FFmpeg:globalThis.__cancelFFmpeg})");return{contents:source,loader:'ts',resolveDir:process.cwd()+'/lib/prisma'};});}}]});
const {loadEngine,cancelEngine}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const old=loadEngine(()=>{}),oldRejected=assert.rejects(old,/cancelada/);await chunkStarted.promise;cancelEngine();
const replacement=await loadEngine(()=>{});firstChunk.resolve(new Response(new Uint8Array([0,97,115,109,1,0,0,0])));await oldRejected;
assert.ok(replacement.loaded);assert.equal(replacement.terminated,false);assert.equal(await loadEngine(()=>{}),replacement);
cancelEngine();
const gate={...defer(),started:defer()};pendingLoad=gate;
const loading=loadEngine(()=>{}),loadingRejected=assert.rejects(loading,/cancelada/);await gate.started.promise;cancelEngine();
const newest=await loadEngine(()=>{});gate.resolve();await loadingRejected;
assert.ok(newest.loaded);assert.equal(newest.terminated,false);assert.equal(await loadEngine(()=>{}),newest);
cancelEngine();console.log('PASS cancellation during fetch and worker load preserves the replacement engine');
