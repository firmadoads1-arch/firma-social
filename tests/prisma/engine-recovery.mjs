import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
globalThis.location={origin:'https://prisma.test'};
Object.defineProperty(globalThis,'crossOriginIsolated',{value:false,configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{hardwareConcurrency:8,deviceMemory:8},configurable:true});
const data=new Uint8Array([0,97,115,109,1,0,0,0]);
const manifest={chunks:['core-0.bin'],bytes:8,chunkSizes:[8],sha256:[createHash('sha256').update(data).digest('hex')]};
const cache=new Map([['/prisma-engine/core-0.bin',new Uint8Array([0,97,115,109,9,9,9,9])]]),requests=[],instances=[];
globalThis.caches={open:async()=>({match:async path=>cache.has(path)?new Response(cache.get(path)):undefined,delete:async path=>cache.delete(path),put:async(path,response)=>{cache.set(path,new Uint8Array(await response.arrayBuffer()));}})};
globalThis.fetch=async path=>{requests.push(path);return path.includes('manifest.json')?new Response(JSON.stringify(manifest)):new Response(data);};
class FFmpeg {
 loaded=false;
 constructor(){instances.push(this);}
 on(){}
 async load(config){this.config=config;if(config.workerURL)throw Error('Accelerated worker failed');this.loaded=true;}
 terminate(){this.loaded=false;this.terminated=true;}
}
globalThis.__recoveryFFmpeg=FFmpeg;
const bundle=await build({stdin:{contents:"export {loadEngine,cancelEngine} from './lib/prisma/media.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'worker-transport',setup(b){b.onLoad({filter:/lib\/prisma\/media\.ts$/},({path})=>({contents:fs.readFileSync(path,'utf8').replace("import(/* @vite-ignore */ (location.origin+'/prisma-engine/ffmpeg-r2/index.js'))","Promise.resolve({FFmpeg:globalThis.__recoveryFFmpeg})"),loader:'ts',resolveDir:process.cwd()+'/lib/prisma'}));}}]});
const {loadEngine,cancelEngine}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const first=await loadEngine(()=>{});
assert.equal(requests.filter(path=>path==='/prisma-engine/core-0.bin').length,1,'corrupt cached bytes must be downloaded again');
assert.deepEqual(cache.get('/prisma-engine/core-0.bin'),data);
first.terminate();const replacement=await loadEngine(()=>{});
assert.notEqual(replacement,first);assert.ok(replacement.loaded);
cancelEngine();Object.defineProperty(globalThis,'crossOriginIsolated',{value:true});
const fallback=await loadEngine(()=>{});assert.ok(!fallback.config.workerURL);cancelEngine();
const before=instances.filter(instance=>instance.config?.workerURL).length;
await loadEngine(()=>{});
assert.equal(instances.filter(instance=>instance.config?.workerURL).length,before,'failed acceleration must not be retried for the next profile');
cancelEngine();
console.log('PASS corrupt-cache recovery, replacement after a crashed worker, and persistent compatible fallback');
