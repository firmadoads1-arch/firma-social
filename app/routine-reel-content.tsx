'use client';
import {useEffect,useState} from 'react';
import {reelCaptions,type ReelContent,type CaptionGenerator} from '@/lib/reel-content';
import {usableCover} from '@/lib/editor-defaults';
import type {Media} from '@/lib/domain';
import {Field,Thumb,requestJSON} from './ui';

export default function RoutineReelContent({value,onChange,caption,onCaption,videos,media,groupId,busy,onUploading}:{value:ReelContent;onChange:(patch:Partial<ReelContent>)=>void;caption:string;onCaption:(s:string)=>void;videos:Media[];media:Media[];groupId:string|null;busy:boolean;onUploading:(busy:boolean)=>void}){
 const [uploaded,setUploaded]=useState<Media[]>([]),[uploading,setUploading]=useState(false),[uploadError,setUploadError]=useState(''),[page,setPage]=useState(0);
 const all=[...media,...uploaded.filter(m=>!media.some(a=>a.id===m.id))],covers=all.filter(m=>usableCover(m)&&(!m.groupId||m.groupId===groupId||m.id===value.coverId)),cover=covers.find(m=>m.id===value.coverId);
 const ordered=[...videos].sort((a,b)=>a.createdAt-b.createdAt||(a.id<b.id?-1:a.id>b.id?1:0)),pages=Math.max(1,Math.ceil(ordered.length/8)),current=Math.min(page,pages-1),shown=ordered.slice(current*8,(current+1)*8),blocked=busy||uploading;
 useEffect(()=>setPage(0),[videos.map(m=>m.id).join(',')]);
 let captions:Record<string,string>={},captionError='';
 if(value.captionMode==='unique')try{captions=reelCaptions(ordered,value.captionGenerator,value.videoCaptions);}catch(e:any){captionError=e.message;try{captions=reelCaptions(ordered,value.captionGenerator);}catch{}}
 function generator(patch:Partial<CaptionGenerator>){onChange({captionGenerator:{...value.captionGenerator,...patch},videoCaptions:{}});}
 async function upload(file:File){
  setUploading(true);onUploading(true);setUploadError('');let bitmap:ImageBitmap|undefined;
  try{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>8*1024*1024)throw Error('Envie uma imagem JPG, PNG ou WebP de até 8 MB.');
   bitmap=await createImageBitmap(file);const scale=Math.min(1,1080/bitmap.width,1920/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a capa.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();bitmap=undefined;
   const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível preparar o JPG.')),'image/jpeg',.92));if(jpeg.size>8*1024*1024)throw Error('A capa preparada excede 8 MB. Escolha uma imagem menor.');
   const name=file.name.replace(/\.[^.]+$/,'').slice(0,130)+'-capa-rotina.jpg',form=new FormData();if(groupId)form.set('group',groupId);form.set('file',new File([jpeg],name,{type:'image/jpeg'}));form.set('width',String(canvas.width));form.set('height',String(canvas.height));
   const result=await requestJSON('/api/upload',{method:'POST',body:form}),m={id:result.id,name,mime:'image/jpeg',size:jpeg.size,width:canvas.width,height:canvas.height,duration:null,folder:'Geral',publicUrl:null,createdAt:Date.now(),groupId} as Media;
   setUploaded(items=>[...items,m]);onChange({coverMode:'custom',coverId:m.id});
  }catch(e:any){setUploadError(e.message??'Não foi possível enviar a capa.');}finally{bitmap?.close();setUploading(false);onUploading(false);}
 }
 return <div className="routine-reel-content">
  <section className="options-panel"><h4>Capa padrão da rotina</h4>
   <Field label="Thumb dos Reels" hint="A imagem escolhida será a mesma em todos os vídeos e perfis desta rotina."><select aria-label="Thumb dos Reels da rotina" disabled={blocked} value={value.coverMode==='custom'?value.coverId??'':value.coverMode} onChange={e=>{const v=e.target.value;onChange({coverMode:v==='account'?'account':v==='frame'?'frame':'custom',coverId:['account','frame'].includes(v)?null:v});}}><option value="account">Padrão de cada perfil</option><option value="frame">Quadro escolhido pelo Instagram</option>{covers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
   <Field label={uploading?'Enviando capa…':'Ou enviar uma capa para a rotina'} hint="JPG, PNG ou WebP até 8 MB. A imagem é preparada como JPG e salva na biblioteca."><input type="file" accept="image/jpeg,image/png,image/webp" disabled={blocked} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></Field>
   {value.coverMode==='custom'&&cover&&<div className="reel-cover-preview"><Thumb media={cover}/><div><strong>{cover.name}</strong><p>Mesma thumb para todos os vídeos e perfis selecionados.</p><button type="button" className="text-button" disabled={blocked} onClick={()=>onChange({coverMode:'account',coverId:null})}>Usar novamente o padrão dos perfis</button></div></div>}
   {value.coverMode==='custom'&&!cover&&<p className="error" role="alert">Selecione uma capa JPG disponível na biblioteca.</p>}
   {uploadError&&<p className="error" role="alert">{uploadError}</p>}
  </section>
  <section className="options-panel"><h4>Legendas dos vídeos</h4>
   <Field label="Como criar as legendas"><select disabled={blocked} value={value.captionMode} onChange={e=>onChange({captionMode:e.target.value as ReelContent['captionMode']})}><option value="common">Uma legenda comum para todos os vídeos</option><option value="unique">Uma legenda única para cada vídeo</option></select></Field>
   {value.captionMode==='common'?<Field label="Legenda comum aos Reels"><textarea rows={3} maxLength={2200} value={caption} disabled={blocked} onChange={e=>onCaption(e.target.value)}/></Field>:<>
    <p>Gerador por modelos: personalize o tema, o estilo e a chamada. Cada vídeo recebe um texto diferente, com prévia editável.</p>
    <Field label="Tema das legendas" hint="Exemplo: rotina, novidades e bastidores da Cacau."><textarea rows={2} maxLength={500} disabled={blocked} value={value.captionGenerator.theme} onChange={e=>generator({theme:e.target.value})}/></Field>
    <div className="form-row"><Field label="Estilo"><select disabled={blocked} value={value.captionGenerator.style} onChange={e=>generator({style:e.target.value as CaptionGenerator['style']})}><option value="casual">Casual</option><option value="engaging">Conversa e curiosidade</option><option value="professional">Profissional</option></select></Field><Field label="Chamada final"><select disabled={blocked} value={value.captionGenerator.cta} onChange={e=>generator({cta:e.target.value as CaptionGenerator['cta']})}><option value="comment">Convidar para comentar</option><option value="save">Convidar para salvar</option><option value="share">Convidar para compartilhar</option><option value="none">Sem chamada final</option></select></Field></div>
    <Field label="Hashtags opcionais"><input disabled={blocked} maxLength={500} value={value.captionGenerator.hashtags} placeholder="#bastidores #novidades" onChange={e=>generator({hashtags:e.target.value})}/></Field>
    <label className="check"><input type="checkbox" disabled={blocked} checked={value.captionGenerator.includeVideoName} onChange={e=>generator({includeVideoName:e.target.checked})}/>Incluir o nome do vídeo na legenda</label>
    <button type="button" className="button" disabled={blocked||!value.captionGenerator.theme.trim()||!ordered.length||ordered.length>100} onClick={()=>generator({seed:(value.captionGenerator.seed+1)%1000001})}>Gerar novas legendas únicas</button>
    <p className="muted small">Alterar o gerador ou gerar novamente substitui a prévia e suas edições manuais. A prévia usa o tema e, se selecionado, o nome do arquivo. Revise os textos antes de ativar a rotina.</p>
    {captionError&&<p className="error" role="alert">{captionError}</p>}
    <h4>Prévia por vídeo · {ordered.length} vídeo(s)</h4>
    <div className="routine-caption-list">{shown.map(m=><article className="routine-caption-card" key={m.id}><div className="routine-caption-heading"><strong>{m.name}</strong><span>{(value.videoCaptions[m.id]??captions[m.id]??'').length}/2200</span></div><textarea rows={5} aria-label={'Legenda de '+m.name} maxLength={2200} disabled={blocked||!value.captionGenerator.theme.trim()} value={value.videoCaptions[m.id]??captions[m.id]??''} onChange={e=>onChange({videoCaptions:{...value.videoCaptions,[m.id]:e.target.value}})}/></article>)}</div>
    {pages>1&&<div className="routine-caption-pages"><button type="button" className="button small" disabled={current===0} onClick={()=>setPage(current-1)}>Anterior</button><span>Página {current+1} de {pages}</span><button type="button" className="button small" disabled={current+1===pages} onClick={()=>setPage(current+1)}>Próxima</button></div>}
    <p className="muted small">A legenda de cada vídeo será usada em todos os perfis selecionados. Novos vídeos da pasta receberão legendas pelo mesmo gerador.</p>
   </>}
  </section>
 </div>;
}
