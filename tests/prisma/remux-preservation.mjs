// Exercises the real production remux path with the shipped FFmpeg WASM core.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import createCore from '../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
globalThis.self={location:{href:'https://prisma.test/'}};
const core=await createCore({wasmBinary:fs.readFileSync('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm')});
core.setLogger(({message})=>globalThis.__prismaLog?.(message));
const exec=args=>{core.setTimeout(60000);core.exec(...args);const code=core.ret;core.reset();assert.equal(code,0,args.join(' '));};
globalThis.__prismaEngine={loaded:true,writeFile:async(n,b)=>core.FS.writeFile(n,b),readFile:async(n,encoding='binary')=>core.FS.readFile(n,{encoding}),deleteFile:async n=>core.FS.unlink(n),exec:async args=>{exec(args);return 0;},ffprobe:async args=>{core.ffprobe(...args);const code=core.ret;core.reset();return code;}};
const bundle=await build({stdin:{contents:"export {processMedia,inspect} from './lib/prisma/media';export {renderSharedReelVersions} from './lib/prisma/prepare-shared-reel';export {sharedReelSettings} from './lib/prisma/shared-reel';export {defaults} from './lib/prisma/catalog';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'local-wasm-transport',setup(b){b.onLoad({filter:/lib\/prisma\/media\.ts$/},({path})=>{let s=fs.readFileSync(path,'utf8');const a=s.indexOf('export async function loadEngine('),z=s.indexOf('const ext=');s=s.slice(0,a)+"export async function loadEngine(){globalThis.__prismaLog=m=>logs.push(m);return globalThis.__prismaEngine;}\n"+s.slice(z);return{contents:s,loader:'ts',resolveDir:process.cwd()+'/lib/prisma'};});}}]});
const {processMedia,inspect,renderSharedReelVersions,defaults,sharedReelSettings}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
exec(['-v','error','-f','lavfi','-i','testsrc2=size=96x160:rate=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-metadata','title=Original','fixture.mp4']);
const original=new Uint8Array(core.FS.readFile('fixture.mp4'));
const file=new File([original],'source.mp4',{type:'video/mp4'});
const sourceInfo=await inspect(file,()=>{});
// Even non-neutral visual settings cannot cause a remux to apply filters.
const [first]=await processMedia(file,'remux',{...defaults,zoom:1.5,speed:1.5,volume:.2,intro:1},()=>{});
const [second]=await processMedia(file,'remux',sharedReelSettings(80),()=>{});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const a=new Uint8Array(await first.blob.arrayBuffer()),b=new Uint8Array(await second.blob.arrayBuffer());
assert.notEqual(hash(a),hash(original));assert.notEqual(hash(b),hash(original));assert.notEqual(hash(a),hash(b));
for(const [name,bytes] of [['original',original],['first',a],['second',b]]){
 core.FS.writeFile(name+'.mp4',bytes);
 for(const stream of ['v','a'])exec(['-v','error','-i',name+'.mp4','-map','0:'+stream+':0','-c','copy','-f','hash','-hash','sha256',name+'-'+stream+'.txt']);
}
for(const stream of ['v','a']){const expected=core.FS.readFile('original-'+stream+'.txt',{encoding:'utf8'});assert.equal(core.FS.readFile('first-'+stream+'.txt',{encoding:'utf8'}),expected);assert.equal(core.FS.readFile('second-'+stream+'.txt',{encoding:'utf8'}),expected);}
assert.equal(first.info.duration,sourceInfo.duration);
for(const type of ['video','audio']){const a=sourceInfo.raw.streams.find(s=>s.codec_type===type),b=first.info.raw.streams.find(s=>s.codec_type===type);for(const key of ['codec_name','width','height','avg_frame_rate','r_frame_rate','sample_rate','channels','color_space','color_transfer','color_primaries'])assert.equal(b[key],a[key],key);}
assert.equal(first.info.width,96);assert.equal(first.info.height,160);assert.equal(first.info.duration,second.info.duration);assert.equal(first.info.codec,'h264');assert.equal(first.info.audioCodec,'aac');
assert.match(first.info.raw.format.tags.comment,/Prisma export [0-9a-f-]{36}/);assert.notEqual(first.info.raw.format.tags.comment,second.info.raw.format.tags.comment);
for(const key of ['contrast','saturation','zoom','speed','volume'])assert.equal(sharedReelSettings(80)[key],1);for(const key of ['brightness','rotation','grain','pitch','bass','intro','outro'])assert.equal(sharedReelSettings(80)[key],0);
// A video without audio remains without audio, and user metadata is retained.
exec(['-v','error','-i','fixture.mp4','-an','-c:v','copy','silent.mp4']);
const [silent]=await processMedia(new File([new Uint8Array(core.FS.readFile('silent.mp4'))],'silent.mp4',{type:'video/mp4'}),'remux',{...defaults,metaMode:'custom',title:'Meu título',software:'Meu editor'},()=>{});
assert.equal(silent.info.audio,false);assert.equal(silent.info.raw.format.tags.title,'Meu título');assert.match(silent.info.raw.format.tags.comment,/Meu editor · Prisma export/);
console.log('PASS: unique file hashes and metadata per export; encoded video/audio packets, dimensions and codecs preserved; no-audio source and custom metadata supported.');

// Rotation is presentation data and must survive the metadata-only export.
exec(['-v','error','-i','fixture.mp4','-c','copy','-metadata:s:v:0','rotate=90','rotated.mp4']);
const rotatedFile=new File([new Uint8Array(core.FS.readFile('rotated.mp4'))],'rotated.mov',{type:'video/quicktime'}),rotationBefore=await inspect(rotatedFile,()=>{});
const [rotated]=await processMedia(rotatedFile,'remux',defaults,()=>{});
assert.equal(rotated.info.width,rotationBefore.width);assert.equal(rotated.info.height,rotationBefore.height);assert.equal(rotated.info.width,160);assert.equal(rotated.info.height,96);
const uploaded=[];globalThis.fetch=async(url,init={})=>{if(String(url).startsWith('/api/media/'))return new Response(original,{headers:{'Content-Type':'video/mp4'}});if(init.method==='POST'){uploaded.push(init.body);return Response.json({ok:true});}return Response.json(null);};
await renderSharedReelVersions({projectId:crypto.randomUUID(),source:{id:'source',name:'original.mp4',mime:'video/mp4',size:original.length},profiles:[{id:crypto.randomUUID(),username:'first'},{id:crypto.randomUUID(),username:'second'}],progress:()=>{}});
assert.equal(uploaded.length,2);assert.notEqual(hash(new Uint8Array(await uploaded[0].arrayBuffer())),hash(new Uint8Array(await uploaded[1].arrayBuffer())));
for(const [i,blob] of uploaded.entries()){core.FS.writeFile('batch-'+i+'.mp4',new Uint8Array(await blob.arrayBuffer()));for(const stream of ['v','a']){exec(['-v','error','-i','batch-'+i+'.mp4','-map','0:'+stream+':0','-c','copy','-f','hash','-hash','sha256','batch-'+i+'-'+stream+'.txt']);assert.equal(core.FS.readFile('batch-'+i+'-'+stream+'.txt',{encoding:'utf8'}),core.FS.readFile('original-'+stream+'.txt',{encoding:'utf8'}));}}
console.log('PASS: rotation retained and actual per-profile preparation uses distinct metadata-only files with unchanged video/audio packets.');

// All source video/audio tracks survive; remux must not silently drop extras.
exec(['-v','error','-i','fixture.mp4','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-map','0:v:0','-map','0:v:0','-map','0:a:0','-map','1:a:0','-c:v','copy','-c:a','aac','-t','1','multi.mp4']);
const [multi]=await processMedia(new File([new Uint8Array(core.FS.readFile('multi.mp4'))],'multi.mp4',{type:'video/mp4'}),'remux',defaults,()=>{});
core.FS.writeFile('multi-output.mp4',new Uint8Array(await multi.blob.arrayBuffer()));
for(const stream of ['v','a']){assert.equal(multi.info.raw.streams.filter(s=>s.codec_type===(stream==='v'?'video':'audio')).length,2);for(let i=0;i<2;i++){for(const name of ['multi','multi-output'])exec(['-v','error','-i',name+'.mp4','-map','0:'+stream+':'+i,'-c','copy','-f','hash','-hash','sha256',name+'-'+stream+i+'.txt']);assert.equal(core.FS.readFile('multi-'+stream+i+'.txt',{encoding:'utf8'}),core.FS.readFile('multi-output-'+stream+i+'.txt',{encoding:'utf8'}));}}
console.log('PASS: all video and audio tracks remain byte-for-byte identical, including multi-track files.');
