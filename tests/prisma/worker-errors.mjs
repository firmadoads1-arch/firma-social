import assert from 'node:assert/strict';
import {FFmpeg} from '../../public/prisma-engine/ffmpeg-r2/classes.js';
const workers=[];
globalThis.Worker=class {
 constructor(){workers.push(this);}
 postMessage(message){this.last=message;}
 terminate(){this.terminated=true;}
};
const ff=new FFmpeg();
let loading=ff.load({classWorkerURL:'https://prisma.test/worker.js'});
const rejected=assert.rejects(loading,/core import failed/);
workers[0].onerror({message:'core import failed',preventDefault(){}});
await rejected;
assert.equal(ff.loaded,false);assert.equal(workers[0].terminated,true);
loading=ff.load({classWorkerURL:'https://prisma.test/worker.js'});
assert.equal(workers.length,2);
workers[1].onmessage({data:{id:workers[1].last.id,type:'LOAD',data:true}});
await loading;assert.equal(ff.loaded,true);
const pending=ff.exec(['-version']);const messageError=assert.rejects(pending,/comunicação/);
workers[1].onmessageerror({preventDefault(){}});await messageError;
assert.equal(ff.loaded,false);assert.equal(workers[1].terminated,true);
console.log('PASS worker import/crash/message failures reject promptly and allow a new worker');
