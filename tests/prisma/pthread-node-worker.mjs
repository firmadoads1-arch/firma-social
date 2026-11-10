// Transport adapter only: execute the shipped Emscripten worker unchanged.
import {parentPort,workerData} from 'node:worker_threads';
globalThis.self=globalThis;
globalThis.location={href:workerData.entry};
globalThis.importScripts=()=>{throw Error('The shipped worker uses ES modules.');};
globalThis.postMessage=(data,transfers)=>parentPort.postMessage(data,transfers);
const pending=[];let ready=false;
parentPort.on('message',data=>{if(ready)self.onmessage({data});else pending.push(data);});
await import(workerData.entry);
ready=true;for(const data of pending)self.onmessage({data});
