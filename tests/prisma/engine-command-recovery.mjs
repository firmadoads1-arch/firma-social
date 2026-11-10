import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
globalThis.location={origin:'https://prisma.test'};
Object.defineProperty(globalThis,'crossOriginIsolated',{value:true,configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{hardwareConcurrency:8,deviceMemory:8},configurable:true});
globalThis.fetch=async path=>path.includes('manifest.json')?new Response(JSON.stringify({chunks:['core-0.bin'],bytes:8})):new Response(new Uint8Array([0,97,115,109,1,0,0,0]));
const instances=[];let hangCompatible=false,hangStage='probe',execStarted=()=>{};
class FFmpeg{
 loaded=false;files=new Map();pending=[];
 constructor(){instances.push(this);}
 on(){}
 async load(config){this.config=config;this.loaded=true;}
 terminate(){this.loaded=false;this.terminated=true;for(const reject of this.pending)reject(Error('called FFmpeg.terminate'));this.pending=[];}
 async writeFile(name,data){if(!this.loaded)throw Error('not loaded');this.files.set(name,data);}
 async readFile(name){if(!this.loaded)throw Error('not loaded');return this.files.get(name);}
 async deleteFile(name){if(!this.loaded)throw Error('not loaded');if(hangStage==='delete'&&this.config.workerURL)return new Promise((_,reject)=>this.pending.push(reject));this.files.delete(name);}
 async exec(){execStarted();if(hangStage==='exec'&&this.config.workerURL)return new Promise((_,reject)=>this.pending.push(reject));this.files.set('output-0.mp4',new Uint8Array([1,2,3,4]));return 0;}
 async ffprobe(){
  if(hangStage==='probe'&&this.config.workerURL||hangCompatible)return new Promise((_,reject)=>this.pending.push(reject));
  this.files.set('probe.json',JSON.stringify({format:{duration:'25.796'},streams:[{codec_type:'video',codec_name:'h264',width:720,height:1280}]}));return 0;
 }
}
globalThis.__commandFFmpeg=FFmpeg;
const bundle=await build({stdin:{contents:"export {inspect,processMedia,cancelEngine} from './lib/prisma/media.ts';export {defaults} from './lib/prisma/catalog.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'worker-boundary',setup(b){
 b.onLoad({filter:/lib\/prisma\/media\.ts$/},({path})=>({contents:fs.readFileSync(path,'utf8').replace("import(/* @vite-ignore */ (location.origin+'/prisma-engine/ffmpeg-r2/index.js'))","Promise.resolve({FFmpeg:globalThis.__commandFFmpeg})"),loader:'ts',resolveDir:process.cwd()+'/lib/prisma'}));
 b.onLoad({filter:/lib\/engine-watchdog\.ts$/},({path})=>({contents:fs.readFileSync(path,'utf8').replace('{io:30000,probe:30000,firstFrame:45000,idle:120000,total:600000}','{io:25,probe:25,firstFrame:25,idle:50,total:200}'),loader:'ts',resolveDir:process.cwd()+'/lib/prisma'}));
}}]});
const {inspect,cancelEngine}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const file=new File([new Uint8Array([1,2,3])],'input.mp4',{type:'video/mp4'}),messages=[];
const info=await inspect(file,(p,message)=>messages.push(message));
assert.equal(info.width,720);assert.equal(instances.length,2);assert.ok(instances[0].terminated);assert.ok(instances[0].config.workerURL);assert.equal(instances[1].config.workerURL,undefined);
assert.ok(messages.some(m=>m.includes('Reprocessando no modo compatível')));
assert.equal((await inspect(file,()=>{})).duration,25.796);assert.equal(instances.length,2);
cancelEngine();hangCompatible=true;await assert.rejects(()=>inspect(file,()=>{}),error=>error.name==='EngineCommandError'&&!error.accelerated);assert.equal(instances.length,3,'compatible failure must not retry forever');
cancelEngine();console.log('PASS real public inspect flow: stalled accelerated probe retries once in compatible mode, preserves input, reuses result and stops on compatible failure');

hangCompatible=false;hangStage='exec';
const render=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')+'#render');
const count=instances.length;
const [output]=await render.processMedia(file,'remux',render.defaults,()=>{});
assert.equal(output.blob.size,4);assert.equal(instances.length,count+2);assert.equal(instances.at(-1).config.workerURL,undefined);render.cancelEngine();
const cancel=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')+'#cancel');
let started;const executing=new Promise(resolve=>{started=resolve;});execStarted=started;
const before=instances.length,pending=cancel.processMedia(file,'remux',cancel.defaults,()=>{});
const rejected=assert.rejects(pending,/cancelada/);await executing;cancel.cancelEngine();await rejected;
assert.equal(instances.length,before+1,'user cancellation must never start a fallback render');
console.log('PASS stalled export retries once, returns output, and user cancellation never starts another render');

hangStage='delete';execStarted=()=>{};
const deletion=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')+'#deletion');
const beforeDelete=instances.length;
assert.equal((await deletion.inspect(file,()=>{})).duration,25.796);
assert.equal(instances.length,beforeDelete+2,'a stalled probe-file cleanup must retain its typed error and retry');
deletion.cancelEngine();console.log('PASS stalled preparation cleanup also recovers instead of hiding the engine error');
