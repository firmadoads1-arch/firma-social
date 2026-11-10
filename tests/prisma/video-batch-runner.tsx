'use client';
// Local browser fixture. Mount temporarily at app/batch-check/page.tsx; never publish that route.
import {useEffect,useState} from 'react';
import VideoBatchStudio from '../../app/prisma/video-batch-studio';
import type {ProfileOutputMetadata} from '../../lib/prisma/profile-handoff';
const template={id:'11111111-1111-4111-8111-111111111111',handle:'modelo.qa',mime:'image/png',size:10,created:1,updated:1,crop:{x:.5,y:.35,zoom:1}};
export default function VideoBatchFixture(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[received,setReceived]=useState<ProfileOutputMetadata[]>([]),[error,setError]=useState('');
 useEffect(()=>{
  const original=window.fetch;
  window.fetch=async(input,init)=>{
   const url=typeof input==='string'?input:input instanceof Request?input.url:String(input);
   if(url.startsWith('/api/templates/'))return original('/qa-batch-avatar.png',init);
   if(url.startsWith('/api/files?'))return Response.json({error:'Biblioteca simulada indisponível para verificar preservação do vídeo.'},{status:503});
   return original(input,init);
  };
  setReady(true);return()=>{window.fetch=original;};
 },[]);
 return <main style={{padding:24,maxWidth:1400,margin:'auto'}}>
  <section className="panel" style={{padding:16,marginBottom:20}}><h2>Verificação local · vídeos em lote</h2><p>Motor real. Somente o armazenamento é simulado; nenhuma gravação de produção.</p><strong>Entregas confirmadas: {received.length}</strong>{error&&<p role="alert">{error}</p>}<pre data-testid="batch-handoff">{JSON.stringify(received.map(item=>({source:item.source?.name,model:item.template.handle,width:item.video.width,height:item.video.height,mode:item.settings.profileLayout?.mode,outputId:item.outputId})),null,2)}</pre></section>
  {ready&&<VideoBatchStudio active templates={[template]} busy={busy} onBusy={setBusy} back={()=>{}} openTemplates={()=>{}} refreshFiles={async()=>{}} onVideoReady={async({metadata,blob})=>{
   if(blob.size!==metadata.file.bytes||metadata.video.width!==1080||metadata.video.height!==1920){setError('Entrega inválida');throw Error('Entrega inválida');}
   setReceived(items=>[...items,metadata]);
  }}/>}
 </main>;
}
