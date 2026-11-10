import type {Settings} from './catalog';
import type {Output} from './media';
import {isEngineStartupError,isEngineCommandError,mediaErrorMessage} from './media-errors';
import {normalizeProfileLayout,profileExportName,type ProfileTemplate,type ProfileRender} from './profile-types';
import {profileOutputMetadata,type ProfileOutputMetadata} from './profile-handoff';
import {operationId} from './operation-id';

export const MAX_BATCH_VIDEOS=50;
export const MAX_BATCH_FILE_BYTES=80*1024*1024;
export type VideoBatchInput={id:string;file:File;index:number};
export type VideoBatchPlan={batchId:string;template:ProfileTemplate;settings:Settings;items:VideoBatchInput[]};
export type VideoBatchState='pending'|'working'|'done'|'error'|'cancelled';
export type VideoBatchEvent={id:string;state:VideoBatchState;percent:number;error?:string;output?:Output;metadata?:ProfileOutputMetadata};

export function videoInputError(file:File):string|undefined{
 if(!/\.(mp4|mov|webm)$/i.test(file.name)&&!/^video\/(mp4|quicktime|webm)$/.test(file.type))return 'Use MP4, MOV ou WebM.';
 if(!file.size)return 'O arquivo está vazio.';
 if(file.size>MAX_BATCH_FILE_BYTES)return 'O limite é de 80 MB por vídeo.';
}
const fingerprint=(file:File)=>JSON.stringify([file.name,file.size,file.lastModified]);
export function addVideoBatchInputs(current:VideoBatchInput[],files:File[]){
 const items=[...current],errors:string[]=[],seen=new Set(current.map(item=>fingerprint(item.file)));
 let duplicates=0;
 for(const original of files){
  const error=videoInputError(original);if(error){errors.push(`${original.name}: ${error}`);continue;}
  const key=fingerprint(original);if(seen.has(key)){duplicates++;continue;}
  if(items.length>=MAX_BATCH_VIDEOS){errors.push(`Limite de ${MAX_BATCH_VIDEOS} vídeos por lote. Os arquivos excedentes não foram adicionados.`);break;}
  const mime=original.type||(/\.mov$/i.test(original.name)?'video/quicktime':/\.webm$/i.test(original.name)?'video/webm':'video/mp4');
  const file=original.type?original:new File([original],original.name,{type:mime,lastModified:original.lastModified});
  items.push({id:operationId(),file,index:items.length+1});seen.add(key);
 }
 return{items,errors,duplicates};
}
export function createVideoBatchPlan(items:VideoBatchInput[],template:ProfileTemplate,settings:Settings):VideoBatchPlan{
 if(!items.length||items.length>MAX_BATCH_VIDEOS)throw Error(`Selecione de 1 a ${MAX_BATCH_VIDEOS} vídeos.`);
 if(!template.id||!template.handle)throw Error('Selecione um template de perfil.');
 if(new Set(items.map(item=>item.id)).size!==items.length)throw Error('A fila contém identificadores repetidos.');
 for(const item of items){const error=videoInputError(item.file);if(error)throw Error(`${item.file.name}: ${error}`);}
 return{batchId:operationId(),template:structuredClone(template),settings:{...structuredClone(settings),ratio:'9:16',maxSide:1920,profileLayout:normalizeProfileLayout(settings.profileLayout)},items:items.map((item,index)=>({...item,index:index+1}))};
}
export function videoBatchExportName(handle:string,index:number,now=new Date()){
 return profileExportName(handle,now).replace(/\.mp4$/,`_${String(index).padStart(3,'0')}.mp4`);
}

/** Serial rendering shares one engine and one identity. Delivery may overlap through a bounded queue. */
export async function runVideoBatch({plan,onlyIds,signal,loadProfile,process,emit,progress,onOutput}: {
 plan:VideoBatchPlan;onlyIds?:string[];signal:AbortSignal;
 loadProfile:(template:ProfileTemplate)=>Promise<ProfileRender>;
 process:(file:File,settings:Settings,progress:(percent:number,message:string)=>void,profile:ProfileRender)=>Promise<Output>;
 emit:(event:VideoBatchEvent)=>void;
 progress:(percent:number,message:string)=>void;
 onOutput?:(item:VideoBatchInput,out:Output,metadata:ProfileOutputMetadata)=>Promise<void>;
}){
 const selected=onlyIds?new Set(onlyIds):null,targets=plan.items.filter(item=>!selected||selected.has(item.id));
 if(!targets.length)return;
 // Snapshot even for retries; neither a UI update nor a consumer can alter later renders.
 const settings=structuredClone(plan.settings),template=structuredClone(plan.template);
 let index=0;
 try{
  if(signal.aborted)return;
  progress((plan.items.length-targets.length)/plan.items.length*100,'Carregando o template do lote…');
  const profile=await loadProfile(template);
  for(;index<targets.length;index++){
   if(signal.aborted)break;
   const item=targets[index],offset=plan.items.length-targets.length+index;
   emit({id:item.id,state:'working',percent:0});
   let out:Output;
   try{
    out=await process(item.file,structuredClone(settings),(value,message)=>{
     if(signal.aborted)return;
     const percent=Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
     emit({id:item.id,state:'working',percent});
     progress((offset+percent/100)/plan.items.length*100,`Vídeo ${item.index}/${plan.items.length} · ${message}`);
    },{...profile,crop:profile.crop?{...profile.crop}:profile.crop});
    if(signal.aborted)break;
    if(!out.blob.size)throw Error('O motor não retornou um vídeo.');
   }catch(error){
    if(signal.aborted)break;
    emit({id:item.id,state:'error',percent:0,error:mediaErrorMessage(error)});
    if(isEngineStartupError(error)||isEngineCommandError(error)){index++;throw error;}
    progress((offset+1)/plan.items.length*100,`Vídeo ${item.index}: falha isolada. Continuando o lote…`);
    continue;
   }
   out={...out,name:videoBatchExportName(template.handle,item.index)};
   const metadata=profileOutputMetadata(plan.batchId,operationId(),{id:template.id,handle:template.handle},out);
   metadata.source={id:item.id,name:item.file.name,bytes:item.file.size,lastModified:item.file.lastModified,index:item.index};
   emit({id:item.id,state:'done',percent:100,output:out,metadata:structuredClone(metadata)});
   if(onOutput&&!signal.aborted)try{await onOutput(item,out,metadata);}catch(error){
    if(!signal.aborted)emit({id:item.id,state:'done',percent:100,error:'Vídeo pronto. Falha na entrega: '+mediaErrorMessage(error)});
   }
   if(!signal.aborted)progress((offset+1)/plan.items.length*100,`Vídeo ${item.index}/${plan.items.length} pronto`);
  }
 }catch(error){
  if(!signal.aborted){
   for(const item of targets.slice(index))emit({id:item.id,state:'cancelled',percent:0,error:mediaErrorMessage(error)});
   throw error;
  }
 }finally{
  if(signal.aborted)for(const item of targets.slice(index))emit({id:item.id,state:'cancelled',percent:0});
 }
}
