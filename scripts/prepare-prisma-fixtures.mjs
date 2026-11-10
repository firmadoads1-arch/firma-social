// Optional synthetic fixtures for the source export. No user media is downloaded.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const publicDir=path.join(root,'outputs/prisma-qa'),outputs=path.join(root,'outputs');
fs.mkdirSync(outputs,{recursive:true});fs.mkdirSync(publicDir,{recursive:true});
const portrait=path.join(outputs,'reference-avatar.png');
if(!fs.existsSync(portrait))fs.copyFileSync(path.join(root,'tests/prisma/fixtures/reference-avatar.png'),portrait);
const files=[['demo.mp4',3],['qa-demo.mp4',6]];
const missing=files.filter(([name])=>!fs.existsSync(path.join(publicDir,name)));
if(!missing.length){
 console.log('Fixtures already exist; no files overwritten.');
 process.exit(0);
}
globalThis.self??={location:{href:'http://localhost/'}};
const {default:createCore}=await import('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js');
const core=await createCore({wasmBinary:fs.readFileSync(path.join(root,'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm'))});
const messages=[];
core.setLogger(({message})=>{messages.push(message);if(messages.length>20)messages.shift();});
for(const [name,duration] of missing){
 const args=['-v','error','-f','lavfi','-i','testsrc2=size=480x270:rate=24',
 '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(duration),
 '-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','ultrafast','-crf','23',
 '-threads','1','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k',
 '-movflags','+faststart','fixture.mp4'];
 core.setTimeout(120000);core.exec(...args);
 const status=core.ret;core.reset();
 if(status!==0)throw Error('Unable to generate '+name+': '+messages.join('\n'));
 fs.writeFileSync(path.join(publicDir,name),new Uint8Array(core.FS.readFile('fixture.mp4')));
 core.FS.unlink('fixture.mp4');
 console.log('Generated synthetic '+name+' ('+duration+' s)');
}
console.log('Ready. These local MP4 fixtures were not included in the export ZIP.');

