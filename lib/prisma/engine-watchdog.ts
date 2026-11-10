import type {FFmpeg} from '@ffmpeg/ffmpeg';
import {EngineCommandError} from './media-errors';

const guarded=new WeakSet<object>();
export type EngineDeadlines={io:number;probe:number;firstFrame:number;idle:number;total:number};
const defaults:EngineDeadlines={io:30000,probe:30000,firstFrame:45000,idle:120000,total:600000};

// Deadlines run on the page, outside WASM. FFmpeg's internal timeout cannot
// interrupt a deadlocked pthread or a worker that stopped sending messages.
export function protectEngine(ff:FFmpeg,accelerated:boolean,limits:EngineDeadlines=defaults){
 if(guarded.has(ff))return;guarded.add(ff);
 let activity:((time:number,progress:number)=>void)|null=null;
 ff.on('progress',({time,progress})=>activity?.(time,progress));
 const methods=ff as unknown as Record<string,(...args:unknown[])=>Promise<unknown>>;
 for(const name of ['writeFile','readFile','deleteFile','ffprobe','exec']){
  if(typeof methods[name]!=='function')continue;
  const original=methods[name].bind(ff);
  methods[name]=(...args)=>new Promise((resolve,reject)=>{
   let settled=false,timer:ReturnType<typeof setTimeout>,absolute:ReturnType<typeof setTimeout>|undefined;
   const finish=(success:boolean,result:unknown)=>{
    if(settled)return;settled=true;clearTimeout(timer);if(absolute)clearTimeout(absolute);
    if(name==='exec')activity=null;
    if(success)resolve(result);else reject(result);
   };
   const stalled=()=>{
    if(settled)return;
    const stage=name==='exec'?'A renderização parou de responder':name==='ffprobe'?'A análise do vídeo parou de responder':'A preparação do arquivo parou de responder';
    finish(false,new EngineCommandError(stage+'. O arquivo original foi preservado.',accelerated));
    ff.terminate();
   };
   const arm=(milliseconds:number)=>{clearTimeout(timer);timer=setTimeout(stalled,milliseconds);};
   arm(name==='exec'?limits.firstFrame:name==='ffprobe'?limits.probe:limits.io);
   if(name==='exec'){
    let lastTime=-1,lastProgress=-1;
    activity=(time,progress)=>{
     if(Number.isFinite(time)&&time>lastTime||Number.isFinite(progress)&&progress>lastProgress){
      lastTime=Math.max(lastTime,time||0);lastProgress=Math.max(lastProgress,progress||0);
      if(time>0||progress>0)arm(limits.idle);
     }
    };
    absolute=setTimeout(stalled,limits.total);
   }
   try{Promise.resolve(original(...args)).then(value=>finish(true,value),error=>finish(false,error));}catch(error){finish(false,error);}
  });
 }
}
