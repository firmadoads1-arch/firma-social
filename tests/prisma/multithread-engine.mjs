// Real shared-memory WASM and shipped pthread code, using Node workers as transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import createCore from '../../public/prisma-engine/mt/core.js';
const workers=[];
globalThis.self={location:{href:'http://localhost/'}};
globalThis.Worker=class {
 constructor(entry){
  this.worker=new NodeWorker(new URL('./pthread-node-worker.mjs',import.meta.url),{workerData:{entry:String(entry)}});
  this.worker.on('message',data=>this.onmessage?.({data}));
  this.worker.on('error',error=>this.onerror?.(error));workers.push(this);
 }
 postMessage(data,transfers){this.worker.postMessage(data,transfers);}
 terminate(){void this.worker.terminate();}
};
const coreURL=new URL('../../public/prisma-engine/mt/core.js',import.meta.url).href;
const workerURL=new URL('../../public/prisma-engine/mt/core.worker.js',import.meta.url).href;
const manifest=JSON.parse(fs.readFileSync('public/prisma-engine/mt/manifest.json'));
const wasm=Buffer.concat(manifest.chunks.map(name=>fs.readFileSync('public/prisma-engine/mt/'+name)));
const started=performance.now();let core;
const watchdog=setTimeout(()=>{console.error('Real multithread core timed out');process.exit(1);},45000);
try{
 core=await createCore({wasmBinary:wasm,mainScriptUrlOrBlob:coreURL+'#'+Buffer.from(JSON.stringify({wasmURL:'unused',workerURL})).toString('base64')});
 assert.equal(workers.length,4,'startup must initialize only four pthread workers');
 console.log('PASS real multithread startup: four workers in '+Math.round(performance.now()-started)+' ms');
 core.setLogger(()=>{});core.FS.writeFile('input.mp4',fs.readFileSync('outputs/prisma-qa/demo.mp4'));core.setTimeout(30000);
 core.exec('-v','error','-threads','4','-i','input.mp4','-t','1','-vf','fps=30,scale=1080:1920','-c:v','libx264','-preset','ultrafast','-crf','22','-threads','4','-filter_threads','2','-c:a','copy','output.mp4');
 assert.equal(core.ret,0);assert.ok(core.FS.readFile('output.mp4').length>1000);
 console.log('PASS real multithread Full HD encode with bounded decoder/encoder threads');
}finally{clearTimeout(watchdog);core?.PThread.terminateAllThreads();for(const worker of workers)worker.terminate();}
