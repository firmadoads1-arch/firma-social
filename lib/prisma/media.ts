import {renderProfileLayer} from './profile-layout';
import {normalizeProfileLayout,profileGeometry,profileExportName,type ProfileRender} from './profile-types';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { defaults, type Settings, type ToolId } from './catalog';
import {exportVariations} from './randomize';
import {EngineStartupError,EngineCommandError,isEngineStartupError,isEngineCommandError,isFatalMediaError,mediaErrorMessage} from './media-errors';
import {protectEngine} from './engine-watchdog';
type Progress=(progress:number,message:string)=>void;
export type Info={duration:number;width:number;height:number;audio:boolean;video:boolean;image:boolean;codec:string;audioCodec:string;raw:Record<string,unknown>};
export type PreviewRequest={kind:'image'|'video';start:number};
export type Output={blob:Blob;name:string;info:Info;settings:Settings;preview?:{before:Blob;kind:'image'|'video';start:number;sourceDuration:number}};
export type Comparison={hashA:string;hashB:string;identical:boolean;visual:number|null;ssim:number|null;infoA:Info;infoB:Info;samples:number};
let engine:FFmpeg|null=null,loading:Promise<FFmpeg>|null=null,logs:string[]=[],listener:Progress|null=null,locked=false,engineEpoch=0;
let engineThreads=1,loadAbort:AbortController|null=null,accelerationFailed=false;
let sourceCache:{ff:FFmpeg;file:File;name:string;info:Info}|null=null;
export function cancelEngine(){engineEpoch++;loadAbort?.abort();loadAbort=null;engine?.terminate();engine=null;loading=null;sourceCache=null;engineThreads=1;locked=false;listener=null;}
function processingError(ff:FFmpeg|undefined,error:unknown):Error {
 if(isEngineStartupError(error))return error;
 if(ff&&(isEngineCommandError(error)||isFatalMediaError(error)||(error instanceof Error&&error.name==='MediaWorkerError'))){
  const accelerated=engine===ff&&engineThreads>1;
  // A WASM trap can corrupt subsequent commands. Discard this worker before retrying.
  ff.terminate();if(engine===ff){engine=null;loading=null;sourceCache=null;engineThreads=1;}
  return isEngineCommandError(error)?error:new EngineCommandError(mediaErrorMessage(error),accelerated);
 }
 return new Error(mediaErrorMessage(error));
}
export async function loadEngine(progress:Progress){
 if(engine?.loaded)return engine;if(loading)return loading;
 const epoch=engineEpoch,controller=new AbortController();loadAbort=controller;let candidate:FFmpeg|null=null;
 const check=()=>{if(epoch!==engineEpoch||controller.signal.aborted)throw new DOMException('Operação cancelada.','AbortError');};
 const waitFor=async<T,>(promise:Promise<T>,milliseconds:number,message:string):Promise<T>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  let aborted=()=>{};
  try{return await Promise.race([promise,new Promise<never>((_,reject)=>{
   aborted=()=>reject(new DOMException('Operação cancelada.','AbortError'));
   controller.signal.addEventListener('abort',aborted,{once:true});
   timer=setTimeout(()=>reject(new EngineStartupError(message)),milliseconds);
  })]);}finally{if(timer)clearTimeout(timer);controller.signal.removeEventListener('abort',aborted);}
 };
 loading=(async()=>{
  progress(1,'Carregando o motor de mídia…');
  const module=await waitFor(import(/* @vite-ignore */ (location.origin+'/prisma-engine/ffmpeg-r2/index.js')),30000,'Não foi possível carregar o motor. Verifique a conexão e tente novamente.');check();
  const hardware=typeof navigator!=='undefined'?navigator.hardwareConcurrency||2:2;
  const memory=typeof navigator!=='undefined'?(navigator as Navigator&{deviceMemory?:number}).deviceMemory||0:0;
  // The shared-memory core reserves 1 GiB; smaller/unknown devices use the
  // compatible core. A failed accelerated startup is not repeated for each job.
  const accelerated=!accelerationFailed&&globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer!=='undefined'&&hardware>=4&&memory>=8;
  let cache:Cache|undefined;try{cache=await caches.open('prisma-media-engine-0.12.10');}catch{}
  const bytes=async(path:string,fresh=false)=>{
   check();let cached:Response|undefined;try{if(!fresh)cached=await cache?.match(path);}catch{}
   if(cached)return new Uint8Array(await cached.arrayBuffer());
   const response=await waitFor(fetch(path,{signal:controller.signal,cache:fresh?'reload':'default'}),60000,'O download do motor demorou demais. Verifique a conexão e tente novamente.');check();
   if(!response.ok||response.headers.get('Content-Type')?.includes('text/html'))throw new EngineStartupError('Não foi possível baixar o motor. Atualize o acesso ao estúdio e tente novamente.');
   const data=new Uint8Array(await waitFor(response.arrayBuffer(),120000,'O download do motor foi interrompido. Tente novamente.'));check();
   // Cache storage is optional and must not delay startup on slow disks.
   if(cache)void cache.put(path,new Response(data.slice().buffer)).catch(()=>{});
   return data;
  };
  for(const multi of accelerated?[true,false]:[false]){
   try{
    const base=multi?'/prisma-engine/mt/':'/prisma-engine/';
    const manifestPath=base+'manifest.json?v=2';
    const manifest=JSON.parse(new TextDecoder().decode(await bytes(manifestPath))) as {chunks:string[];bytes:number;chunkSizes?:number[];sha256?:string[]};
    if(!Array.isArray(manifest.chunks)||!manifest.chunks.length||manifest.chunks.length>16||!manifest.chunks.every(name=>/^core-[0-9]+[.]bin$/.test(name))||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<8)throw new EngineStartupError('A configuração do motor está incompleta. Atualize a página.');
    const chunks:Uint8Array[]=new Array(manifest.chunks.length);let complete=0,next=0;
    const download=async()=>{while(next<manifest.chunks.length){
     const index=next++,path=base+manifest.chunks[index];
     for(let attempt=0;attempt<2;attempt++){
      const data=await bytes(path,attempt===1);check();
      const sizeOK=manifest.chunkSizes?.[index]===undefined||data.byteLength===manifest.chunkSizes[index];
      const digest=manifest.sha256?.[index]&&globalThis.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data.buffer as ArrayBuffer)),b=>b.toString(16).padStart(2,'0')).join(''):null;
      if(sizeOK&&(!digest||digest===manifest.sha256![index])){chunks[index]=data;break;}
      try{await cache?.delete(path);}catch{}
      if(attempt)throw new EngineStartupError('O download do motor veio incompleto. Tente novamente.');
     }
     progress(Math.round(++complete/manifest.chunks.length*9),multi?'Carregando motor acelerado…':'Carregando motor compatível…');
    }};
    await Promise.all([download(),download()]);check();
    if(chunks.reduce((n,chunk)=>n+chunk.byteLength,0)!==manifest.bytes||chunks[0][0]!==0||chunks[0][1]!==97||chunks[0][2]!==115||chunks[0][3]!==109)throw new EngineStartupError('O arquivo do motor está incompleto. Tente novamente.');
    const ff:FFmpeg=new module.FFmpeg();candidate=ff;engine=ff;
    ff.on('log',({message})=>{logs.push(message);if(logs.length>150)logs.shift();});ff.on('progress',({progress:p})=>listener?.(Math.min(96,Math.max(15,15+p*80)),'Processando mídia…'));
    const wasmURL=URL.createObjectURL(new Blob(chunks as BlobPart[],{type:'application/wasm'}));
    progress(10,multi?'Iniciando motor acelerado…':'Iniciando motor compatível…');
    try{await waitFor(ff.load({coreURL:location.origin+base+'core.js?v=2',wasmURL,classWorkerURL:location.origin+'/api/prisma/media-worker/ffmpeg?v=3',...(multi?{workerURL:location.origin+'/api/prisma/media-worker/pthread?v=3'}:{})}),multi?45000:90000,'O navegador não conseguiu iniciar o motor. Feche outras abas pesadas e tente novamente; o vídeo selecionado foi preservado.');}finally{URL.revokeObjectURL(wasmURL);}
    check();engineThreads=multi?Math.min(4,hardware-1):1;protectEngine(ff,multi);progress(12,'Motor pronto');return ff;
   }catch(error){
    candidate?.terminate();candidate=null;if(epoch===engineEpoch)engine=null;check();
    if(!multi)throw error;
    accelerationFailed=true;progress(1,'A aceleração não iniciou. Usando o modo compatível…');
   }
  }
  throw new EngineStartupError('Não foi possível iniciar o motor.');
 })().catch(error=>{
  candidate?.terminate();if(epoch===engineEpoch){engine=null;sourceCache=null;engineThreads=1;}
  if(controller.signal.aborted||epoch!==engineEpoch)throw new Error('Operação cancelada.');
  throw new EngineStartupError(mediaErrorMessage(error));
 }).finally(()=>{if(epoch===engineEpoch){loading=null;loadAbort=null;}});
 return loading;
}
const ext=(file:File)=>file.name.toLowerCase().split('.').pop()?.replace(/[^a-z0-9]/g,'').slice(0,8)||'mp4';
async function recoverMedia<T>(work:()=>Promise<T>,progress:Progress):Promise<T>{
 const epoch=engineEpoch;
 try{return await work();}catch(error){
  if(epoch!==engineEpoch||!isEngineCommandError(error)||!error.accelerated)throw error;
  accelerationFailed=true;engine?.terminate();engine=null;loading=null;sourceCache=null;engineThreads=1;
  progress(1,'A aceleração não respondeu. Reprocessando no modo compatível…');
  // Retry this operation once, without asking the user to rebuild the batch.
  return work();
 }
}
async function run(ff:FFmpeg,args:string[]){logs=[];const code=await ff.exec(['-v','warning','-filter_threads','1',...args],600000);if(code!==0)throw Error('A exportação não foi concluída. '+logs.filter(l=>/error|invalid|failed|not supported|out of/i.test(l)).slice(-2).join(' ').slice(0,250));}
async function probe(ff:FFmpeg,name:string,image=false):Promise<Info>{
  // Core 0.12.10 can return -1 on a successful ffprobe run. Validate its fresh JSON output instead.
  try{await ff.deleteFile('probe.json');}catch(error){if(isEngineCommandError(error))throw error;}
  await ff.ffprobe(['-v','error','-threads','1','-show_format','-show_streams','-of','json',name,'-o','probe.json'],30000);
  let raw:any;try{raw=JSON.parse(await ff.readFile('probe.json','utf8') as string);}catch(error){if(isEngineCommandError(error))throw error;throw Error('Não foi possível ler esta mídia. Use um arquivo MP4, WebM, JPEG, PNG, MP3 ou WAV válido.');}
  await ff.deleteFile('probe.json');if(!Array.isArray(raw.streams)||!raw.streams.length)throw Error('Nenhuma faixa de mídia válida encontrada.');
  const v=raw.streams.find((s:any)=>s.codec_type==='video'),a=raw.streams.find((s:any)=>s.codec_type==='audio');const rotation=Math.abs(v?.side_data_list?.find((s:any)=>s.rotation!==undefined)?.rotation||0);
  return{duration:Number(raw.format?.duration)||0,width:rotation%180?v?.height||0:v?.width||0,height:rotation%180?v?.width||0:v?.height||0,audio:!!a,video:!!v,image,codec:v?.codec_name||'',audioCodec:a?.codec_name||'',raw};
}
async function clear(ff:FFmpeg,names:string[]){for(const name of names)try{await ff.deleteFile(name);}catch{}}
async function prepareSource(ff:FFmpeg,file:File){
 if(sourceCache?.ff===ff&&sourceCache.file===file)return{name:sourceCache.name,info:{...sourceCache.info}};
 if(sourceCache?.ff===ff)await clear(ff,[sourceCache.name]);sourceCache=null;
 const name='source.'+ext(file);await ff.writeFile(name,new Uint8Array(await file.arrayBuffer()));
 try{const info=await probe(ff,name,file.type.startsWith('image/'));sourceCache={ff,file,name,info};return{name,info:{...info}};}catch(error){await clear(ff,[name]);throw error;}
}
export async function inspect(file:File,progress:Progress):Promise<Info>{return recoverMedia(()=>inspectOnce(file,progress),progress);}
async function inspectOnce(file:File,progress:Progress):Promise<Info>{if(locked)throw Error('Aguarde a operação atual.');locked=true;const epoch=engineEpoch;let ff:FFmpeg|undefined;try{ff=await loadEngine(progress);return(await prepareSource(ff,file)).info;}catch(error){throw processingError(ff,error);}finally{if(epoch===engineEpoch)locked=false;}}
function dimensions(info:Info,s:Settings){if(s.ratio!=='original'){const [a,b]=s.ratio.split(':').map(Number);return{w:Math.round((a>=b?s.maxSide:s.maxSide*a/b)/2)*2,h:Math.round((b>=a?s.maxSide:s.maxSide*b/a)/2)*2};}const k=Math.min(1,s.maxSide/Math.max(info.width,info.height));return{w:Math.max(16,Math.round(info.width*k/2)*2),h:Math.max(16,Math.round(info.height*k/2)*2)};}
function visual(s:Settings){const f=[];if(s.zoom>1)f.push(`crop=trunc(iw/${s.zoom}/2)*2:trunc(ih/${s.zoom}/2)*2`);if(s.flip)f.push('hflip');if(s.rotation)f.push(`rotate=${s.rotation}*PI/180:fillcolor=black`);if(s.contrast!==1||s.brightness!==0||s.saturation!==1)f.push(`eq=contrast=${s.contrast}:brightness=${s.brightness}:saturation=${s.saturation}`);if(s.grain)f.push(`noise=alls=${s.grain}:allf=t+u:all_seed=${s.randomSeed||1}`);return f;}
const audioChanged=(s:Settings)=>s.pitch!==0||s.speed!==1||s.volume!==1||s.bass!==0||s.echo||s.intro>0||s.outro>0;
function addAudio(args:string[],info:Info,s:Settings,canCopy:boolean){if(!info.audio)return;args.push('-map','0:a:0');if(canCopy&&!audioChanged(s)&&info.audioCodec==='aac')args.push('-c:a','copy');else args.push('-af',sound(s).join(','),'-c:a','aac','-b:a','160k');}
function sound(s:Settings){const ratio=2**(s.pitch/12),f=['aresample=48000'];if(s.pitch)f.push(`asetrate=${Math.round(48000*ratio)}`,`aresample=48000`,`atempo=${1/ratio}`);if(s.speed!==1)f.push(`atempo=${s.speed}`);f.push(`volume=${s.volume}`);if(s.bass)f.push(`bass=g=${s.bass}`);if(s.echo)f.push('aecho=0.8:0.7:70:0.18');if(s.intro)f.push(`adelay=${Math.round(s.intro*1000)}:all=1`);if(s.outro)f.push(`apad=pad_dur=${s.outro}`);return f;}
function metadata(s:Settings){const a=['-map_metadata','-1','-map_chapters','-1'];if(s.metaMode==='custom')for(const [key,val]of Object.entries({title:s.title,artist:s.author,comment:s.software,make:s.make,model:s.model}))if(val)a.push('-metadata',`${key}=${val.slice(0,200)}`);return a;}
async function board(text:string,w:number,h:number,full:boolean){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d')!;if(full){g.fillStyle='#161525';g.fillRect(0,0,w,h);const grad=g.createLinearGradient(0,0,w,h);grad.addColorStop(0,'#7460e055');grad.addColorStop(1,'#16152500');g.fillStyle=grad;g.fillRect(0,0,w,h);}else{g.fillStyle='#11111dcc';g.fillRect(w*.04,h*.78,w*.92,h*.15);}g.fillStyle='#ffffff';let fs=Math.max(16,w*.055);g.font=`600 ${fs}px Arial`;while(g.measureText(text).width>w*.84&&fs>12){fs--;g.font=`600 ${fs}px Arial`;}g.textAlign='center';g.textBaseline='middle';g.fillText(text.slice(0,120),w/2,full?h/2:h*.855);const b=await new Promise<Blob>((resolve,reject)=>c.toBlob(v=>v?resolve(v):reject(Error('Falha ao criar título.')),'image/png'));return new Uint8Array(await b.arrayBuffer());}
function withExif(bytes:Uint8Array,s:Settings){const entries:[[number,string],[number,string],[number,string],[number,string],[number,string]]=[[0x010e,s.title],[0x010f,s.make],[0x0110,s.model],[0x0131,s.software],[0x013b,s.author]];const selected=entries.filter(([,v])=>v);if(!selected.length||bytes[0]!==255||bytes[1]!==216)return bytes;const encode=(v:string)=>new TextEncoder().encode(v.normalize('NFKD').replace(/[^\x20-\x7E]/g,'').slice(0,180)+'\0');const values=selected.map(([,v])=>encode(v));const base=8+2+12*selected.length+4;const tiff=new Uint8Array(base+values.reduce((n,v)=>n+(v.length>4?v.length:0),0));const d=new DataView(tiff.buffer);tiff.set([73,73,42,0,8,0,0,0]);d.setUint16(8,selected.length,true);let offset=base;selected.forEach(([tag],i)=>{const p=10+12*i,v=values[i];d.setUint16(p,tag,true);d.setUint16(p+2,2,true);d.setUint32(p+4,v.length,true);if(v.length<=4)tiff.set(v,p+8);else{d.setUint32(p+8,offset,true);tiff.set(v,offset);offset+=v.length;}});const app=new Uint8Array(10+tiff.length);app.set([255,225,0,0,69,120,105,102,0,0]);new DataView(app.buffer).setUint16(2,app.length-2);app.set(tiff,10);const out=new Uint8Array(bytes.length+app.length);out.set(bytes.subarray(0,2));out.set(app,2);out.set(bytes.subarray(2),app.length+2);return out;}
export async function processMedia(file:File,tool:ToolId,settings:Settings,onProgress:Progress,preview?:PreviewRequest,profile?:ProfileRender):Promise<Output[]>{
 return recoverMedia(()=>processMediaOnce(file,tool,settings,onProgress,preview,profile),onProgress);
}
async function processMediaOnce(file:File,tool:ToolId,settings:Settings,onProgress:Progress,preview?:PreviewRequest,profile?:ProfileRender):Promise<Output[]>{
 if(tool==='profile'){if(!profile)throw Error('Selecione um template de perfil.');settings={...settings,ratio:'9:16',maxSide:1920,profileLayout:normalizeProfileLayout(settings.profileLayout),profileTemplate:{id:profile.id,handle:profile.handle}};}
 if(locked)throw Error('Aguarde a operação atual.');if(file.size>80*1024*1024)throw Error('Selecione um arquivo de até 80 MB.');locked=true;const epoch=engineEpoch;listener=onProgress;const names:string[]=[];let ff:FFmpeg|undefined;
 try{ff=await loadEngine(onProgress);onProgress(13,'Preparando o arquivo…');const {name:input,info}=await prepareSource(ff,file);
 if(!info.video&&!info.audio)throw Error('Nenhuma faixa de vídeo ou áudio encontrada.');if(info.duration>(info.video&&!info.image?180:600))throw Error(info.video?'Use um clipe de até 3 minutos.':'Use um áudio de até 10 minutos.');if(info.width*info.height>16777216)throw Error('A resolução máxima é de 16 megapixels.');
 const videoOnly=['cloak','advanced','profile','remux','variants','formats','watermark'];if(videoOnly.includes(tool)&&(!info.video||info.image))throw Error('Esta ferramenta precisa de um vídeo.');if(tool==='image'&&!info.image)throw Error('Escolha uma imagem JPEG, PNG ou WebP.');if(tool==='audio'&&!info.audio)throw Error('Esta mídia não possui uma faixa de áudio.');
 let clipStart=0,clipDuration=0;const previewKind=info.image?'image':preview?.kind;
 if(preview){
  if(!info.video||tool==='audio')throw Error('A prévia visual precisa de um vídeo ou imagem.');
  if(!info.image){
   if(tool==='trim'&&(settings.start<0||settings.start>=info.duration||settings.end>0&&settings.end<=settings.start))throw Error('O intervalo de corte não é válido.');
   const lower=tool==='trim'?settings.start:0,upper=tool==='trim'&&settings.end>0?Math.min(settings.end,info.duration):info.duration;
   clipStart=Math.max(lower,Math.min(Number.isFinite(preview.start)?preview.start:0,Math.max(lower,upper-.1)));
   clipDuration=Math.min(previewKind==='video'?3:.25,upper-clipStart);
   if(clipDuration<=0)throw Error('Não há conteúdo neste trecho.');
   info.duration=clipDuration;
  }
 }
 const inputArgs=()=>['-threads',String(engineThreads),...(preview&&!info.image?['-ss',String(clipStart),'-t',String(clipDuration)]:[]),'-i',input];
 let before:Blob|undefined;
 if(preview){
  const beforeName=previewKind==='image'?'preview-before.jpg':'preview-before.mp4';names.push(beforeName);
  const beforeArgs=[...inputArgs(),'-map','0:v:0','-vf',"scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-threads','1'];
  // The core's optimized MJPEG Huffman tables trap on some photographic frames.
  // Standard tables preserve JPEG quality and avoid that encoder bug.
  if(previewKind==='image')beforeArgs.push('-an','-frames:v','1','-q:v','2','-huffman','default');
  else{addAudio(beforeArgs,info,defaults,false);beforeArgs.push('-c:v','libx264','-preset','ultrafast','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart');}
  beforeArgs.push(beforeName);onProgress(14,'Preparando o original…');await run(ff,beforeArgs);const bytes=new Uint8Array(await ff.readFile(beforeName) as Uint8Array);before=new Blob([bytes.buffer],{type:previewKind==='image'?'image/jpeg':'video/mp4'});
 }
 const variations=exportVariations(tool,settings).slice(0,preview?1:undefined);const outputs:Output[]=[];
 for(let index=0;index<variations.length;index++){
  const s=preview?{...variations[index],maxSide:Math.min(640,settings.maxSide),...(tool==='trim'?{start:0,end:0}:{})}:variations[index];onProgress(14,variations.length>1?`Variação ${index+1} de ${variations.length}…`:'Preparando exportação…');
  const imageMode=info.image,still=previewKind==='image'&&!imageMode,audioMode=tool==='audio'||(!info.video&&info.audio);let outExt=still?'jpg':imageMode?s.imageFormat:audioMode?s.audioFormat:'mp4';
  const copyMode=!preview&&(tool==='remux'||tool==='metadata')&&!imageMode;
  if(copyMode)outExt=info.video?(ext(file)==='webm'?'webm':'mp4'):(info.audioCodec==='mp3'?'mp3':info.audioCodec==='flac'?'flac':info.audioCodec==='pcm_s16le'?'wav':'m4a');
  const output=`output-${index}.${outExt}`;names.push(output);let args=inputArgs();
  if(copyMode){args.push('-map',info.video?'0:v:0':'0:a:0');if(info.video&&info.audio)args.push('-map','0:a:0');args.push('-c','copy',...metadata(s));if(outExt==='mp4'||outExt==='m4a')args.push('-movflags','+faststart');args.push(output);}
  else if(imageMode){const {w,h}=tool==='metadata'&&!preview?{w:info.width,h:info.height}:dimensions(info,s);const f=tool==='metadata'?[]:visual(s);f.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`,`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`);args.push('-vf',f.join(','),'-frames:v','1','-threads','1',...metadata(s));if(outExt==='jpg')args.push('-q:v','2','-huffman','default');args.push(output);}
  else if(audioMode){args.push('-vn');if(tool==='trim'){if(s.start<0||s.start>=info.duration||s.end>0&&s.end<=s.start)throw Error('O intervalo de corte não é válido.');args.push('-ss',String(s.start));if(s.end>0)args.push('-t',String(Math.min(s.end,info.duration)-s.start));}args.push('-af',sound(s).join(','),'-c:a',outExt==='wav'?'pcm_s16le':'libmp3lame');if(outExt!=='wav')args.push('-b:a','192k');args.push(...metadata(s),output);}
  else{
   if(tool==='trim'&&(s.start<0||s.start>=info.duration||s.end>0&&s.end<=s.start))throw Error('O intervalo de corte não é válido.');
   const {w,h}=dimensions(info,s),editing=['cloak','advanced','profile','variants'].includes(tool),filters=editing?visual(s):[];
   const passthrough=!preview&&['cloak','advanced','formats'].includes(tool)&&s.ratio==='original'&&w===info.width&&h===info.height&&!filters.length&&(!editing||(!s.intro&&!s.outro&&!s.overlay&&s.speed===1))&&info.codec==='h264'&&ext(file)==='mp4';
   if(passthrough){
    onProgress(15,'Preservando as faixas sem alterações…');args.push('-map','0:v:0','-c:v','copy');addAudio(args,info,editing?s:defaults,true);args.push(...metadata(s),'-movflags','+faststart',output);
   }else{
   if(editing&&s.speed!==1)filters.push(`setpts=PTS/${s.speed}`);
   // Drop extra source frames before scaling and compositing at Full HD.
   if(tool==='profile'&&!still)filters.push('fps=30');
   if(tool==='watermark'){const x=Math.max(1,Math.floor(info.width*s.rectX/100)),y=Math.max(1,Math.floor(info.height*s.rectY/100)),rw=Math.min(info.width-x-2,Math.floor(info.width*s.rectW/100)),rh=Math.min(info.height-y-2,Math.floor(info.height*s.rectH/100));if(rw<2||rh<2)throw Error('A região deve ficar dentro do quadro.');filters.push(`delogo=x=${x}:y=${y}:w=${rw}:h=${rh}`);}
   if(!filters.length)filters.push('null');let graph=`[0:v]${filters.join(',')}[edited];`;
   const geometry=tool==='profile'?profileGeometry(w,h,s.profileLayout!):null,bodyH=geometry?.bodyHeight||h;
   if(s.ratio!=='original'&&s.fit==='blur')graph+=`[edited]split[fg0][bg0];[bg0]scale=${w}:${bodyH}:force_original_aspect_ratio=increase,crop=${w}:${bodyH},boxblur=20:2[bg];[fg0]scale=${w}:${bodyH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1${geometry?`,pad=${w}:${h}:0:${geometry.bodyY}:color=black`:''}[frame];`;
   else graph+=`[edited]scale=${w}:${bodyH}:force_original_aspect_ratio=increase,crop=${w}:${bodyH},setsar=1${geometry?`,pad=${w}:${h}:0:${geometry.bodyY}:color=black`:''}[frame];`;
   let current='frame';let inputIndex=1;
   if(!still&&editing&&(s.intro||s.outro)){graph+=`[frame]tpad=start_mode=clone:start_duration=${s.intro}:stop_mode=clone:stop_duration=${s.outro}[padded];`;current='padded';}
   const overlay=async(text:string,full:boolean,enable:string)=>{const name=`title-${index}-${inputIndex}.png`;names.push(name);await ff!.writeFile(name,await board(text,w,h,full));args.push('-threads','1','-i',name);graph+=`[${current}][${inputIndex}:v]overlay=0:0:eof_action=repeat${enable?':enable='+"'"+enable+"'":''}[layer${inputIndex}];`;current='layer'+inputIndex;inputIndex++;};
   if(!still&&editing&&s.intro>0)await overlay(s.introText,true,`lt(t,${s.intro})`);
   if(!still&&editing&&s.outro>0)await overlay(s.outroText,true,`gte(t,${info.duration/s.speed+s.intro})`);
   if(editing&&s.overlay)await overlay(s.overlay,false,'');
   if(tool==='profile'&&profile){const layer=`profile-${index}.png`;names.push(layer);await ff.writeFile(layer,await renderProfileLayer(profile,w,h,s.profileLayout!));args.push('-threads','1','-i',layer);graph+=`[${current}][${inputIndex}:v]overlay=0:0:eof_action=repeat[profiled];`;current='profiled';}
   graph+=`[${current}]format=yuv420p[vout]`;
   args.push('-filter_complex',graph,'-map','[vout]');if(!still)addAudio(args,info,editing?s:defaults,!preview&&tool!=='trim');
   if(tool==='trim'){args.push('-ss',String(s.start));if(s.end>0)args.push('-t',String(Math.min(s.end,info.duration)-s.start));}
   if(still)args.push('-an','-frames:v','1','-q:v','2','-huffman','default','-threads','1','-filter_complex_threads','1',output);
   else args.push('-c:v','libx264','-preset',preview||tool==='profile'&&s.profileEncoding!=='balanced'?'ultrafast':tool==='compress'?'veryfast':'superfast','-crf',String(preview?26:tool==='compress'?s.crf:22),'-threads',String(engineThreads),'-filter_complex_threads',String(Math.min(2,engineThreads)),'-r','30',...metadata(s),'-movflags','+faststart',output);
   }
  }
  onProgress(15,still?'Gerando a imagem de prévia…':'Renderizando vídeo e áudio…');
  await run(ff,args);onProgress(97,'Finalizando o arquivo…');let resultPath=output;
  let data=await ff.readFile(resultPath) as Uint8Array;if(imageMode&&outExt==='jpg'&&s.metaMode==='custom'){data=withExif(data,s);await ff.writeFile(output,new Uint8Array(data));}const mime=outExt==='mp4'?'video/mp4':outExt==='webm'?'video/webm':outExt==='jpg'?'image/jpeg':outExt==='png'?'image/png':outExt==='mp3'?'audio/mpeg':outExt==='wav'?'audio/wav':outExt==='flac'?'audio/flac':'audio/mp4';
  const resultInfo=await probe(ff,resultPath,imageMode||previewKind==='image');const bytes=new Uint8Array(data);const name=profile&&!preview?profileExportName(profile.handle):file.name.replace(/\.[^.]+$/,'').slice(0,80)+`-prisma-${tool}${profile?'-'+profile.handle:''}${variations.length>1?'-'+(index+1):''}.${outExt}`;outputs.push({blob:new Blob([bytes.buffer],{type:mime}),name,info:resultInfo,settings:s,...(preview&&before?{preview:{before,kind:previewKind!,start:clipStart,sourceDuration:clipDuration}}:{})});await ff.deleteFile(output);
 }
 onProgress(100,'Exportação concluída');return outputs;
 }catch(error){throw processingError(ff,error);}finally{if(ff)await clear(ff,names);if(epoch===engineEpoch){locked=false;listener=null;}}
}
const fileHash=async(file:File)=>{const bytes=new Uint8Array(await file.arrayBuffer());const digest=crypto.subtle?new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)):(await import('@noble/hashes/sha2.js')).sha256(bytes);return Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');};
function hashes(bytes:Uint8Array){const all:number[][]=[];for(let p=0;p+72<=bytes.length;p+=72){const bits=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)bits.push(bytes[p+y*9+x]>bytes[p+y*9+x+1]?1:0);all.push(bits);}return all;}
export async function compareMedia(a:File,b:File,onProgress:Progress):Promise<Comparison>{if(locked)throw Error('Aguarde a operação atual.');if(Math.max(a.size,b.size)>80*1024*1024)throw Error('Cada arquivo deve ter até 80 MB.');locked=true;const epoch=engineEpoch;listener=onProgress;let ff:FFmpeg|undefined;const names=['a.'+ext(a),'b.'+ext(b),'a.raw','b.raw','ssim.txt'];try{ff=await loadEngine(onProgress);await ff.writeFile(names[0],new Uint8Array(await a.arrayBuffer()));await ff.writeFile(names[1],new Uint8Array(await b.arrayBuffer()));const infoA=await probe(ff,names[0],a.type.startsWith('image/')),infoB=await probe(ff,names[1],b.type.startsWith('image/'));const hashA=await fileHash(a),hashB=await fileHash(b);let visual:number|null=null,ssim:number|null=null,samples=0;
if(infoA.video&&infoB.video){const all:number[][][]=[];for(let i=0;i<2;i++){const info=i?infoB:infoA;const rate=Math.min(2,32/Math.max(1,info.duration));await run(ff,['-i',names[i],'-an','-vf',`${info.image?'':`fps=${rate},`}scale=9:8,format=gray`,'-frames:v','32','-f','rawvideo',names[i+2]]);all.push(hashes(await ff.readFile(names[i+2]) as Uint8Array));}const score=(first:number[][],second:number[][])=>first.reduce((sum,x)=>sum+Math.max(...second.map(y=>1-x.reduce((d,v,i)=>d+Math.abs(v-y[i]),0)/64)),0)/Math.max(1,first.length);if(all[0].length&&all[1].length){visual=Math.round((score(all[0],all[1])+score(all[1],all[0]))/2*1000)/10;samples=Math.min(all[0].length,all[1].length);}
const filter=(n:number)=>`[${n}:v]${(n?infoB:infoA).image?'':'fps=3,'}scale=256:144:force_original_aspect_ratio=decrease,pad=256:144:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${n}]`;
await run(ff,['-i',names[0],'-i',names[1],'-filter_complex',filter(0)+';'+filter(1)+';[v0][v1]ssim=shortest=1:stats_file=ssim.txt','-an','-t','30','-f','null','-']);const stats=await ff.readFile('ssim.txt','utf8') as string;const values=[...stats.matchAll(/All:([0-9.]+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);if(values.length)ssim=values.reduce((a,b)=>a+b,0)/values.length;}
onProgress(100,'Comparação concluída');return{hashA,hashB,identical:hashA===hashB,visual,ssim,infoA,infoB,samples};}catch(error){throw processingError(ff,error);}finally{if(ff)await clear(ff,names);if(epoch===engineEpoch){locked=false;listener=null;}}}
