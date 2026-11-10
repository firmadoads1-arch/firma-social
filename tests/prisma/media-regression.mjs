// Usage: node tests/media-regression.mjs /absolute/path/to/input.mp4
// The supplied private video stays outside the repository and deployment.
// Runs the production pipeline and shipped WASM. Only browser transport is replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import createCore from '../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js';
const require=createRequire(import.meta.resolve('wrangler/package.json'));
const {build}=require('esbuild');
assert.ok(process.argv[2],'Provide a local MP4 test input');
globalThis.self={location:{href:'http://localhost/'}};
let active=null,restarts=0,failNext=false;
globalThis.__loadMediaEngine=async()=>{
 if(active?.loaded)return active;
 let core=await createCore({wasmBinary:fs.readFileSync('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm')});
 core.setLogger(({message})=>globalThis.__mediaLog?.(message));
 const live=()=>{if(!core)throw 'ffmpeg is not loaded';return core;};
 const invoke=(command,args)=>{
  if(failNext){failNext=false;throw 'RuntimeError: memory access out of bounds';}
  const c=live();
  try{c.setTimeout(600000);c[command](...args);const ret=c.ret;c.reset();return ret;}
  catch(error){throw String(error);} // FFmpeg's browser worker serializes errors this way.
 };
 active={loaded:true,
  terminate(){this.loaded=false;core=null;restarts++;},
  writeFile:async(n,b)=>live().FS.writeFile(n,b),
  readFile:async(n,encoding='binary')=>live().FS.readFile(n,{encoding}),
  deleteFile:async(n)=>live().FS.unlink(n),
  exec:async(args)=>invoke('exec',args),ffprobe:async(args)=>invoke('ffprobe',args)};
 return active;
};
const bundle=await build({stdin:{contents:"export * from './lib/prisma/media.ts';export * from './lib/prisma/randomize.ts';export * from './lib/prisma/shared-reel.ts';export * from './lib/prisma/media-errors.ts';export {defaults} from './lib/prisma/catalog.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'transport-fixture',setup(b){b.onLoad({filter:/lib\/prisma\/media\.ts$/},({path})=>{
 let source=fs.readFileSync(path,'utf8');const start=source.indexOf('export async function loadEngine('),end=source.indexOf('const ext=');
 source=source.slice(0,start)+"export async function loadEngine(){globalThis.__mediaLog=(message)=>logs.push(message);engine=await globalThis.__loadMediaEngine();return engine;}\n"+source.slice(end);
 return{contents:source,loader:'ts',resolveDir:process.cwd()+'/lib/prisma'};
});}}]});
const {processMedia,inspect,defaults,randomizeSettings,sharedReelSettings,mediaErrorMessage}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const file=new File([fs.readFileSync(process.argv[2])],'regression.mp4',{type:'video/mp4'});
const progress=()=>{};
const info=await inspect(file,progress);
assert.ok(info.video&&info.audio&&info.duration>3);
const [variantA]=await processMedia(file,'advanced',sharedReelSettings(0),progress);
const [variantB]=await processMedia(file,'advanced',sharedReelSettings(1),progress);
for(const variant of [variantA,variantB]){
 assert.equal(variant.blob.type,'video/mp4');
 assert.equal(variant.info.width,info.width);assert.equal(variant.info.height,info.height);
 assert.ok(variant.info.audio);assert.ok(Math.abs(variant.info.duration-info.duration)<.15);
}
assert.notDeepEqual(new Uint8Array(await variantA.blob.arrayBuffer()),new Uint8Array(await variantB.blob.arrayBuffer()));
console.log('PASS shared Reel renders different MP4 versions with audio and preserved duration');
const settings=randomizeSettings(defaults,'advanced',235);
const [still]=await processMedia(file,'advanced',settings,progress,{kind:'image',start:0});
assert.equal(still.blob.type,'image/jpeg');assert.ok(still.blob.size>1000);
assert.deepEqual([...new Uint8Array(await still.blob.arrayBuffer()).slice(0,3)],[255,216,255]);
assert.notDeepEqual(new Uint8Array(await still.preview.before.arrayBuffer()),new Uint8Array(await still.blob.arrayBuffer()));
console.log('PASS attached video: before/after JPEG preview');
const [clip]=await processMedia(file,'advanced',settings,progress,{kind:'video',start:1});
const clipSource=await inspect(new File([clip.preview.before],'before.mp4',{type:'video/mp4'}),progress);
assert.ok(Math.abs(clipSource.duration-3)<.15);assert.ok(Math.abs(clip.info.duration-3/settings.speed)<.25);assert.ok(clip.info.audio);
console.log('PASS attached video: 3-second before/after preview with audio');
const [full]=await processMedia(file,'advanced',settings,progress);
assert.equal(full.info.width,info.width);assert.equal(full.info.height,info.height);assert.ok(full.info.audio);
assert.ok(Math.abs(full.info.duration-info.duration/settings.speed)<.25);
console.log('PASS attached video: full resolution export after both previews');
const frame=new File([still.preview.before],'frame.jpg',{type:'image/jpeg'});
const [editedFrame]=await processMedia(frame,'image',{...defaults,saturation:0},progress);
assert.equal(editedFrame.blob.type,'image/jpeg');assert.ok(editedFrame.blob.size>1000);
console.log('PASS photographic JPEG export');
failNext=true;
await assert.rejects(()=>processMedia(file,'advanced',settings,progress,{kind:'image',start:0}),error=>error instanceof Error&&/recarregado automaticamente/.test(error.message));
assert.equal(restarts,1);assert.equal(active.loaded,false);
const [retry]=await processMedia(file,'advanced',settings,progress,{kind:'image',start:2});
assert.ok(retry.blob.size>1000);assert.equal(active.loaded,true);
assert.equal(mediaErrorMessage('Unsupported codec'),'Unsupported codec');
assert.equal(mediaErrorMessage({message:'A specific error'}),'A specific error');
console.log('PASS worker string error: readable message, discarded engine and successful retry');
console.log('ALL ATTACHED MEDIA REGRESSION TESTS PASSED');
