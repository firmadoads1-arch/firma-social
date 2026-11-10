import type {Media} from '../domain';
import {SHARED_REEL_TOOL,sharedReelOutputId,sharedReelSettings} from './shared-reel';

export async function renderSharedReelVersions({
 projectId,group,source,profiles,progress,
}:{
 projectId:string;group?:string|null;source:Media;profiles:{id:string;username:string}[];
 progress:(message:string)=>void;
}){
 let original:File|undefined;
 for(const [index,profile] of profiles.entries()){
  const outputId=await sharedReelOutputId(projectId,profile.id);
  const query=new URLSearchParams({project:projectId,uploadId:outputId});
  if(group)query.set('group',group);
  const lookup='/api/prisma/files?'+query;
  const label=`Versão ${index+1} de ${profiles.length} · @${profile.username}`;
  progress(label+' · verificando arquivo salvo');
  const saved=await fetch(lookup,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!saved.ok)throw Error('Não foi possível consultar os arquivos do projeto Prisma.');
  if(await saved.json())continue;
  if(!original){
   progress('Baixando o vídeo original da biblioteca…');
   const input=await fetch('/api/media/'+source.id,{signal:AbortSignal.timeout(120000)});
   if(!input.ok)throw Error('Não foi possível abrir o vídeo original na biblioteca.');
   original=new File([await input.blob()],source.name,{type:source.mime});
  }
  const {processMedia}=await import('./media');
  const settings=sharedReelSettings(index);
  const [output]=await processMedia(original,'advanced',settings,(percent,message)=>progress(`${label} · ${Math.round(percent)}% · ${message}`));
  if(!output?.info.video||output.blob.type!=='video/mp4'||output.blob.size>80*1024*1024)throw Error(label+' · o Prisma precisa gerar um MP4 de até 80 MB.');
  const handle=profile.username.replace(/[^a-z0-9._-]/gi,'');
  const name=`${String(index+1).padStart(2,'0')}-${handle}-${projectId.slice(0,8)}.mp4`;
  const metadata={
   outputId,accountId:profile.id,sourceId:source.id,
   file:{name,mime:output.blob.type,bytes:output.blob.size},
   video:{width:output.info.width,height:output.info.height,duration:output.info.duration},
  };
  query.set('name',name);
  query.set('tool',SHARED_REEL_TOOL);
  query.set('kind','export');
  query.set('settings',JSON.stringify(output.settings));
  query.set('metadata',JSON.stringify(metadata));
  progress(label+' · salvando na biblioteca');
  const uploaded=await fetch('/api/prisma/files?'+query,{
   method:'POST',headers:{'Content-Type':'video/mp4'},body:output.blob,signal:AbortSignal.timeout(180000),
  });
  if(!uploaded.ok){
   const result=await uploaded.json().catch(()=>null) as {error?:string}|null;
   throw Error(result?.error??label+' · falha ao salvar no Prisma.');
  }
 }
}
