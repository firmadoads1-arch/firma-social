// Production renderer + exact shipped FFmpeg WASM. Browser transport is the only media mock.
// Optional arguments: input-video avatar-image. Input files and generated artifacts stay local.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {Worker as NodeWorker} from 'node:worker_threads';
const multithread=process.env.PRISMA_TEST_MT==='1',workers=[];
const {default:createCore}=await import(multithread?'../../public/prisma-engine/mt/core.js':'../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js');
if(multithread)globalThis.Worker=class {
 constructor(entry){this.worker=new NodeWorker(new URL('./pthread-node-worker.mjs',import.meta.url),{workerData:{entry:String(entry)}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));workers.push(this);}
 postMessage(data,transfers){this.worker.postMessage(data,transfers);}
 terminate(){void this.worker.terminate();}
};
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/');
const {createCanvas,loadImage}=runtime('@napi-rs/canvas');
globalThis.self={location:{href:'http://localhost/'}};
globalThis.document={createElement:()=>createCanvas(16,16)};
globalThis.createImageBitmap=async blob=>{const img=await loadImage(Buffer.from(await blob.arrayBuffer()));img.close=()=>{};return img;};
const coreURL=new URL('../../public/prisma-engine/mt/core.js',import.meta.url).href,workerURL=new URL('../../public/prisma-engine/mt/core.worker.js',import.meta.url).href;
const core=await createCore({wasmBinary:fs.readFileSync('node_modules/@ffmpeg/'+(multithread?'core-mt':'core')+'/dist/esm/ffmpeg-core.wasm'),...(multithread?{mainScriptUrlOrBlob:coreURL+'#'+Buffer.from(JSON.stringify({wasmURL:'unused',workerURL})).toString('base64')}:{})});
process.on('exit',()=>{core.PThread?.terminateAllThreads();for(const worker of workers)worker.terminate();});
globalThis.__profileThreadCount=multithread?4:1;
core.setLogger(({message})=>globalThis.__profileLog?.(message));
const exec=args=>{core.setTimeout(600000);core.exec(...args);const ret=core.ret;core.reset();return ret;};
globalThis.__profileEngine={loaded:true,terminate(){this.loaded=false;},writeFile:async(n,b)=>core.FS.writeFile(n,b),readFile:async(n,encoding='binary')=>core.FS.readFile(n,{encoding}),deleteFile:async(n)=>core.FS.unlink(n),exec:async args=>exec(args),ffprobe:async args=>{core.ffprobe(...args);const ret=core.ret;core.reset();return ret;}};
const bundle=await build({stdin:{contents:"export * from './lib/prisma/media.ts';export * from './lib/prisma/profile-layout.ts';export * from './lib/prisma/profile-types.ts';export * from './lib/prisma/randomize.ts';export * from './lib/prisma/zip.ts';export * from './lib/prisma/video-batch.ts';export {defaults,tools} from './lib/prisma/catalog.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'transport-fixture',setup(b){b.onLoad({filter:/lib\/prisma\/media\.ts$/},({path})=>{let s=fs.readFileSync(path,'utf8');const a=s.indexOf('export async function loadEngine('),z=s.indexOf('const ext=');s=s.slice(0,a)+"export async function loadEngine(){globalThis.__profileLog=(m)=>logs.push(m);engine=globalThis.__profileEngine;engineThreads=globalThis.__profileThreadCount;return engine;}\n"+s.slice(z);return{contents:s,loader:'ts',resolveDir:process.cwd()+'/lib/prisma'};});}}]});
const {processMedia,inspect,defaults,defaultProfileLayout,renderProfileLayer,paintProfileLayer,randomizeSettings,createZip,tools,runVideoBatch,createVideoBatchPlan,addVideoBatchInputs}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
assert.equal(tools.length,14);assert.ok(tools.some(tool=>tool.id==='advanced'));assert.ok(tools.some(tool=>tool.id==='profile'));
const makePhoto=color=>{const c=createCanvas(256,256),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,256,256);g.fillStyle='#fff';g.font='bold 70px sans-serif';g.fillText('PRISMA',5,145,246);return new Blob([c.toBuffer('image/png')],{type:'image/png'});};
const first={id:'profile-one',handle:'perfil.um',avatar:process.argv[3]?new Blob([fs.readFileSync(process.argv[3])],{type:'image/png'}):makePhoto('#ab4d4d')},second={id:'profile-two',handle:'perfil.dois',avatar:makePhoto('#345bba')};
const layout={...defaultProfileLayout,phrase:'ESSA MOEDA SAIU CARO!'};
const image=await createImageBitmap(first.avatar),canvas=createCanvas(1080,1920),g=canvas.getContext('2d');
for(const position of ['top-left','top-right','bottom-left','bottom-right']){
 paintProfileLayer(g,image,image.width,image.height,1080,1920,first.handle,{...layout,position,opacity:0});
 const center=g.getImageData(540,960,1,1).data;assert.equal(center[3],0);
 paintProfileLayer(g,image,image.width,image.height,1080,1920,first.handle,{...layout,position,opacity:.12});
 assert.ok(Math.abs(g.getImageData(540,960,1,1).data[3]-31)<=1);
}
console.log('PASS four layout positions and exact transparent-photo opacity');
fs.writeFileSync('outputs/profile-layer.png',await renderProfileLayer(first,1080,1920,layout));
const source=new File([fs.readFileSync(process.argv[2]||'outputs/prisma-qa/demo.mp4')],'reference.mp4',{type:'video/mp4'}),progress=()=>{};
const original=await inspect(source,progress);
let settings=randomizeSettings({...defaults,profileLayout:layout,ratio:'9:16',maxSide:1920},'profile',587);
settings={...settings,rotation:0,grain:0,intro:0,outro:0}; // Retain seeded speed, audio and color for a representative export.
const snapshot=structuredClone(settings);
const [still]=await processMedia(source,'profile',settings,progress,{kind:'image',start:1},first);assert.equal(still.blob.type,'image/jpeg');assert.equal(still.info.width,360);assert.equal(still.info.height,640);fs.writeFileSync('outputs/profile-preview.jpg',new Uint8Array(await still.blob.arrayBuffer()));
console.log('PASS actual profile before/after JPEG preview');
const [clip]=await processMedia(source,'profile',settings,progress,{kind:'video',start:1},first);assert.ok(clip.info.audio);assert.ok(Math.abs(clip.info.duration-Math.min(3,original.duration-1)/settings.speed)<.3);fs.writeFileSync('outputs/profile-preview.mp4',new Uint8Array(await clip.blob.arrayBuffer()));
console.log('PASS 3-second preview, configured speed and AAC audio');
// Use one 3-second source for both full-resolution identities.
const short=new File([clip.preview.before],'short.mp4',{type:'video/mp4'}),results=[];
for(const profile of [first,second]){
 const [output]=await processMedia(short,'profile',settings,progress,undefined,profile);
 assert.equal(output.info.width,1080);assert.equal(output.info.height,1920);assert.ok(output.info.audio);assert.equal(output.info.codec,'h264');assert.equal(output.info.audioCodec,'aac');
 assert.equal(output.settings.profileTemplate.handle,profile.handle);assert.ok(output.name.includes(profile.handle));
 results.push(output);fs.writeFileSync('outputs/'+profile.handle+'.mp4',new Uint8Array(await output.blob.arrayBuffer()));
 console.log('PASS full-HD profile export:',profile.handle);
}
assert.deepEqual(settings,snapshot);const common=output=>{const {profileTemplate,...rest}=output.settings;return rest;};assert.deepEqual(common(results[0]),common(results[1]));
assert.notDeepEqual(new Uint8Array(await results[0].blob.arrayBuffer()),new Uint8Array(await results[1].blob.arrayBuffer()));
const audio=[];for(let i=0;i<2;i++){core.FS.writeFile('check.mp4',new Uint8Array(await results[i].blob.arrayBuffer()));assert.equal(exec(['-v','error','-i','check.mp4','-vn','-c:a','copy','-f','adts','check.aac']),0);audio.push(new Uint8Array(core.FS.readFile('check.aac')));core.FS.unlink('check.mp4');core.FS.unlink('check.aac');}assert.deepEqual(audio[0],audio[1]);
console.log('PASS shared immutable batch settings and byte-identical audio across profiles');
const fullscreen={...settings,profileLayout:{...layout,mode:'fullscreen',position:'bottom-left',handlePosition:'bottom-left',avatarScale:.22,showPhrase:false}};
for(const profile of [first,second]){
 const [output]=await processMedia(short,'profile',fullscreen,progress,undefined,profile);
 assert.equal(output.info.width,1080);assert.equal(output.info.height,1920);assert.equal(output.settings.profileLayout.mode,'fullscreen');assert.equal(output.settings.profileTemplate.id,profile.id);
 core.FS.writeFile('fullscreen-check.mp4',new Uint8Array(await output.blob.arrayBuffer()));
 assert.equal(exec(['-v','error','-threads','1','-i','fullscreen-check.mp4','-frames:v','1','-vf','crop=100:40:490:0','-f','rawvideo','-pix_fmt','rgb24','fullscreen-check.rgb']),0);
 const pixels=core.FS.readFile('fullscreen-check.rgb');assert.ok(pixels.some(value=>value>25),'top-center video pixels must not be replaced by a black layout band');core.FS.unlink('fullscreen-check.mp4');core.FS.unlink('fullscreen-check.rgb');
}
assert.equal(fullscreen.profileLayout.position,'bottom-left');console.log('PASS two fullscreen profile exports: same layout, distinct identities, no black top band');
fs.writeFileSync('outputs/profile-batch.zip',new Uint8Array(await(await createZip(results.map(r=>({name:r.name,blob:r.blob})))).arrayBuffer()));
await assert.rejects(()=>processMedia(short,'profile',settings,progress),/Selecione um template/);
const [titles]=await processMedia(short,'profile',{...settings,intro:.5,outro:.5,overlay:'Texto do vídeo'},progress,{kind:'video',start:0},first);assert.ok(titles.info.duration>clip.info.duration+.8);
console.log('PASS advanced intro/outro and text remain available with templates');
if(process.env.PRISMA_FULL_REFERENCE==='1'){
 console.log('START full attached source export:',original.duration,'seconds');
 const [full]=await processMedia(source,'profile',settings,progress,undefined,first);assert.equal(full.info.width,1080);assert.equal(full.info.height,1920);assert.ok(Math.abs(full.info.duration-original.duration/settings.speed)<.5);fs.writeFileSync('outputs/profile-reference-full.mp4',new Uint8Array(await full.blob.arrayBuffer()));console.log('PASS full attached video at 1080 x 1920');
}
// Different input files, one identity, same settings: exercise the production batch runner.
const batchInputs=addVideoBatchInputs([], [short,new File(['broken MP4'],'broken.mp4',{type:'video/mp4'}),new File([short],'another-source.mp4',{type:'video/mp4'})]).items;
const batchPlan=createVideoBatchPlan(batchInputs,{id:first.id,handle:first.handle,mime:'image/png',size:first.avatar.size,created:1,updated:1},fullscreen);
const batchEvents=[],batchOutputs=[];
await runVideoBatch({plan:batchPlan,signal:new AbortController().signal,loadProfile:async()=>first,process:async(file,s,notify,p)=>(await processMedia(file,'profile',s,notify,undefined,p))[0],emit:event=>batchEvents.push(event),progress:()=>{},onOutput:async(item,out,metadata)=>batchOutputs.push({item,out,metadata})});
assert.equal(batchOutputs.length,2);assert.equal(batchEvents.filter(e=>e.state==='error').length,1);
assert.equal(batchOutputs[0].out.info.width,1080);assert.equal(batchOutputs[1].out.info.height,1920);
assert.equal(batchOutputs[0].metadata.template.id,batchOutputs[1].metadata.template.id);
assert.deepEqual(batchOutputs[0].out.settings,batchOutputs[1].out.settings);
assert.notEqual(batchOutputs[0].out.name,batchOutputs[1].out.name);
assert.deepEqual(batchOutputs.map(value=>value.metadata.source.name),['short.mp4','another-source.mp4']);
console.log('PASS actual video-batch runner: two 1080x1920 outputs, one model, identical settings; corrupt middle input isolated');
console.log('ALL PROFILE ENGINE TESTS PASSED');

if(multithread){assert.ok(workers.length<=24,`Unexpected thread growth: ${workers.length}`);console.log(`PASS real multithread profile pipeline: ${workers.length} workers maximum`);core.PThread.terminateAllThreads();for(const worker of workers)worker.terminate();}
