import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
globalThis.location={origin:'https://prisma.test'};
Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{hardwareConcurrency:8,deviceMemory:8},configurable:true});
const requests=[],instances=[];
globalThis.fetch=async path=>{requests.push(path);return path.split('?')[0].endsWith('manifest.json')?new Response(JSON.stringify({chunks:['core-0.bin'],bytes:8})):new Response(new Uint8Array([0,97,115,109,1,0,0,0]));};
let failMulti=false;
class FFmpeg{
 loaded=false;terminated=false;
 constructor(){instances.push(this);}
 on(){}
 async load(config){this.config=config;if(config.workerURL&&failMulti)throw Error('Worker unavailable');this.loaded=true;}
 terminate(){this.terminated=true;this.loaded=false;}
}
globalThis.__testFFmpeg=FFmpeg;
const bundle=await build({stdin:{contents:"export {loadEngine,cancelEngine} from './lib/prisma/media.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'worker-transport',setup(b){b.onLoad({filter:/lib\/prisma\/media\.ts$/},({path})=>({contents:fs.readFileSync(path,'utf8').replace("import(/* @vite-ignore */ (location.origin+'/prisma-engine/ffmpeg-r2/index.js'))","Promise.resolve({FFmpeg:globalThis.__testFFmpeg})"),loader:'ts',resolveDir:process.cwd()+'/lib/prisma'}));}}]});
const {loadEngine,cancelEngine}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const multi=await loadEngine(()=>{});assert.ok(multi.config.workerURL.endsWith('/api/prisma/media-worker/pthread?v=3'));assert.ok(multi.config.classWorkerURL.endsWith('/api/prisma/media-worker/ffmpeg?v=3'));assert.equal(await loadEngine(()=>{}),multi);cancelEngine();
failMulti=true;const fallback=await loadEngine(()=>{});assert.equal(fallback.config.workerURL,undefined);assert.ok(fallback.loaded);assert.ok(instances[1].terminated);cancelEngine();
Object.defineProperty(globalThis,'crossOriginIsolated',{value:false});requests.length=0;
const compatible=await loadEngine(()=>{});assert.equal(compatible.config.workerURL,undefined);assert.ok(requests.every(path=>!path.includes('/mt/')));cancelEngine();
console.log('PASS accelerated engine selection, reuse, fallback and non-isolated browser compatibility');
