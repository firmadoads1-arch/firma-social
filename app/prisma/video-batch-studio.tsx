'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,AtSign,Upload,Plus,Film,RefreshCw,Layers3,Download,Loader2,CheckCircle2,AlertCircle,Clock3,Square,Settings2,Trash2,Eye} from 'lucide-react';
import Controls from './controls';
import LibraryPicker from './library-picker';
import VideoLayoutControls from './video-layout-controls';
import BeforeAfter,{type PreviewView} from './before-after';
import ProfileAvatar from './profile-avatar';
import {api,firmaComposerURL} from '../../lib/prisma/client-api';
import {defaults,formatBytes,type Settings} from '../../lib/prisma/catalog';
import {processMedia,cancelEngine} from '../../lib/prisma/media';
import {mediaErrorMessage} from '../../lib/prisma/media-errors';
import {randomizeSettings} from '../../lib/prisma/randomize';
import {renderProfileLayer} from '../../lib/prisma/profile-layout';
import {detectProfileCrop} from '../../lib/prisma/face-crop';
import {defaultProfileLayout,normalizeProfileLayout,profileGeometry,templatePhoto,type ProfileTemplate,type ProfileRender,type ProfileLayout} from '../../lib/prisma/profile-types';
import {profileBatchManifest,type ProfileOutputMetadata,type ProfileVideoReadyHandler} from '../../lib/prisma/profile-handoff';
import {addVideoBatchInputs,createVideoBatchPlan,runVideoBatch,MAX_BATCH_VIDEOS,MAX_BATCH_FILE_BYTES,type VideoBatchInput,type VideoBatchPlan,type VideoBatchState,type VideoBatchEvent} from '../../lib/prisma/video-batch';
import {createZip} from '../../lib/prisma/zip';
import {BackgroundTasks} from '../../lib/prisma/background-tasks';
import './video-batch.css';

type Row={input:VideoBatchInput;state:VideoBatchState;percent:number;url?:string;blob?:Blob;name?:string;size?:number;saved?:string;error?:string;metadata?:ProfileOutputMetadata};
export type VideoBatchStudioProps={active:boolean;templates:ProfileTemplate[];busy:boolean;onBusy:(busy:boolean)=>void;openTemplates:()=>void;back:()=>void;refreshFiles:()=>Promise<void>;onVideoReady?:ProfileVideoReadyHandler};
const initial=():Settings=>({...defaults,profileEncoding:'fast',ratio:'9:16',maxSide:1920,profileLayout:{...defaultProfileLayout}});
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};

// A stalled network request must not hold the entire render queue indefinitely.
async function timedRequest<T>(parent:AbortSignal|undefined,work:(signal:AbortSignal)=>Promise<T>,milliseconds=90000):Promise<T>{
 const controller=new AbortController(),abort=()=>controller.abort();
 if(parent?.aborted)controller.abort();else parent?.addEventListener('abort',abort,{once:true});
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},milliseconds);
 try{return await work(controller.signal);}catch(error){if(timedOut)throw Error('O servidor demorou para responder. O vídeo continua disponível para baixar.');throw error;}
 finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);}
}

export default function VideoBatchStudio({active,templates,busy,onBusy,openTemplates,back,refreshFiles,onVideoReady}:VideoBatchStudioProps){
 const [settings,setSettings]=useState<Settings>(initial),[selected,setSelected]=useState('');
 const [inputs,setInputs]=useState<VideoBatchInput[]>([]),[previewId,setPreviewId]=useState(''),[fileURL,setFileURL]=useState('');
 const [composition,setComposition]=useState(''),[compositionError,setCompositionError]=useState('');
 const [rows,setRows]=useState<Row[]>([]),[autoSave,setAutoSave]=useState(true),[progress,setProgress]=useState(0),[status,setStatus]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [preview,setPreview]=useState<PreviewView|null>(null),[kind,setKind]=useState<'image'|'video'>('image'),[start,setStart]=useState(0),[zipping,setZipping]=useState(false);
 const [archive,setArchive]=useState<{url:string;name:string}|null>(null);
 const picker=useRef<HTMLInputElement>(null),rowsRef=useRef<Row[]>([]),planRef=useRef<VideoBatchPlan|null>(null),operation=useRef(0),controllerRef=useRef<AbortController|null>(null),originalIds=useRef(new Map<string,string>());
 const avatarCache=useRef<{key:string;promise:Promise<ProfileRender>}|null>(null);
 const template=templates.find(t=>t.id===selected),source=inputs.find(item=>item.id===previewId)||inputs[0],layout=normalizeProfileLayout(settings.profileLayout),locked=busy||zipping;
 const replaceRows=(value:Row[])=>{rowsRef.current=value;setRows(value);};
 const patchRow=(id:string,value:Partial<Row>)=>replaceRows(rowsRef.current.map(row=>row.input.id===id?{...row,...value}:row));
 const releaseRows=()=>{for(const row of rowsRef.current)if(row.url?.startsWith('blob:'))URL.revokeObjectURL(row.url);};
 const signature=(next:Settings)=>JSON.stringify({settings:next,source:source?.id,template:template?.id,updated:template?.updated,kind,start});
 useEffect(()=>{if(!templates.some(t=>t.id===selected))setSelected(templates[0]?.id||'');},[templates,selected]);
 useEffect(()=>{setPreview(null);setStart(0);if(!source){setFileURL('');return;}const url=URL.createObjectURL(source.file);setFileURL(url);return()=>URL.revokeObjectURL(url);},[source?.id]);
 useEffect(()=>()=>{if(preview){URL.revokeObjectURL(preview.beforeURL);URL.revokeObjectURL(preview.afterURL);}},[preview]);
 useEffect(()=>()=>{if(archive)URL.revokeObjectURL(archive.url);},[archive]);
 useEffect(()=>()=>{operation.current++;if(controllerRef.current){controllerRef.current.abort();cancelEngine();}releaseRows();},[]);

 const loadProfile=(target:ProfileTemplate)=>{
  const key=target.id+':'+target.updated;
  if(avatarCache.current?.key===key)return avatarCache.current.promise;
  const promise=timedRequest(undefined,async signal=>{
   const response=await fetch(templatePhoto(target),{signal});
   if(!response.ok)throw Error('Não foi possível carregar a foto de @'+target.handle+'.');
   const avatar=await response.blob(),crop=target.crop||(await detectProfileCrop(avatar)).crop;
   return{id:target.id,handle:target.handle,avatar,crop};
  },30000).catch(error=>{if(avatarCache.current?.key===key)avatarCache.current=null;throw error;});
  avatarCache.current={key,promise};return promise;
 };
 useEffect(()=>{
  let disposed=false,url='';setComposition('');setCompositionError('');
  if(active&&template)void(async()=>{try{
   const profile=await loadProfile(template),bytes=await renderProfileLayer(profile,360,640,layout);
   if(disposed)return;url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'image/png'}));setComposition(url);
  }catch(e){if(!disposed)setCompositionError(mediaErrorMessage(e));}})();
  return()=>{disposed=true;if(url)URL.revokeObjectURL(url);};
 },[active,template?.id,template?.updated,JSON.stringify(layout)]);

 const choose=(files:File[])=>{
  if(locked||controllerRef.current)return;
  const result=addVideoBatchInputs(inputs,files);setInputs(result.items);setError(result.errors.join('\n'));
  setNotice(result.duplicates?`${result.duplicates} arquivo(s) já estavam na fila e não foram duplicados.`:'');
 };
 const update=(next:Settings)=>setSettings({...next,ratio:'9:16',maxSide:1920,profileLayout:normalizeProfileLayout(next.profileLayout)});
 const changeLayout=(patch:Partial<ProfileLayout>)=>update({...settings,profileLayout:{...layout,...patch}});
 const previewNow=async(next:Settings=settings)=>{
  if(!source||!template||locked||controllerRef.current)return;
  const op=++operation.current,controller=new AbortController();controllerRef.current=controller;onBusy(true);setError('');setProgress(0);
  try{
   setStatus('Preparando a prévia do vídeo selecionado…');const profile=await loadProfile(template);if(op!==operation.current)return;
   const [out]=await processMedia(source.file,'profile',next,(p,m)=>{if(op===operation.current){setProgress(p);setStatus(m);}}, {kind,start},profile);
   if(op!==operation.current)return;
   if(!out.preview)throw Error('O motor não retornou a prévia.');
   setPreview({beforeURL:URL.createObjectURL(out.preview.before),afterURL:URL.createObjectURL(out.blob),kind:out.preview.kind,start:out.preview.start,sourceDuration:out.preview.sourceDuration,afterDuration:out.info.duration,firstVariant:false,signature:signature(next)});
   setStatus('Prévia pronta');
  }catch(e){if(op===operation.current)setError(mediaErrorMessage(e));}
  finally{if(controllerRef.current===controller)controllerRef.current=null;if(op===operation.current)onBusy(false);}
 };
 const randomize=()=>{if(locked)return;const next=randomizeSettings(settings,'profile');next.profileLayout={...layout,opacity:(10+(next.randomSeed||0)%6)/100};update(next);if(source&&template)void previewNow(next);};
 const saveFile=(blob:Blob,name:string,original:boolean,s:Settings,signal:AbortSignal,metadata?:ProfileOutputMetadata)=>{
  if(blob.size>MAX_BATCH_FILE_BYTES)throw Error('Este arquivo supera o limite de 80 MB da biblioteca. Baixe-o diretamente.');
  return timedRequest(signal,requestSignal=>api('files?'+new URLSearchParams({name,tool:original?'original':'profile-batch',kind:original?'original':'export',settings:JSON.stringify(s),...(metadata?{metadata:JSON.stringify(metadata)}:{})}),{method:'POST',headers:{'Content-Type':blob.type},body:blob,signal:requestSignal}));
 };

 const generate=async(retry=false)=>{
  if(locked||controllerRef.current)return;
  let plan:VideoBatchPlan;
  try{if(retry){if(!planRef.current)return;plan=planRef.current;}else{if(!template)return;plan=createVideoBatchPlan(inputs,template,settings);}}
  catch(e){setError(mediaErrorMessage(e));return;}
  const onlyIds=retry?rowsRef.current.filter(row=>row.state!=='done').map(row=>row.input.id):undefined;
  if(retry&&!onlyIds?.length)return;
  setArchive(null);
  if(!retry){releaseRows();planRef.current=plan;replaceRows(plan.items.map(input=>({input,state:'pending',percent:0})));}
  else replaceRows(rowsRef.current.map(row=>row.state==='done'?row:{input:row.input,state:'pending',percent:0}));
  const op=++operation.current,controller=new AbortController(),uploads=new BackgroundTasks(2);controllerRef.current=controller;
  onBusy(true);setError('');setNotice('');setProgress(0);setStatus('Preparando o lote de vídeos…');
  let lastUpdate=0,lastId='',lastProgress=0;
  const emit=(event:VideoBatchEvent)=>{
   if(op!==operation.current)return;
   if(event.state==='working'&&lastId===event.id&&Date.now()-lastUpdate<150&&event.percent>0&&event.percent<100)return;
   lastUpdate=Date.now();lastId=event.id;
   const {output,metadata,id,...state}=event;
   patchRow(id,{...state,...(metadata?{metadata}:{}),...(output?{url:URL.createObjectURL(output.blob),blob:output.blob,name:output.name,size:output.blob.size}:{} )});
  };
  let failure='';
  try{
   await runVideoBatch({plan,onlyIds,signal:controller.signal,loadProfile,
    process:async(file,s,notify,profile)=>(await processMedia(file,'profile',s,notify,undefined,profile))[0],emit,
    progress:(p,message)=>{if(op===operation.current&&(Date.now()-lastProgress>=150||p===100)){lastProgress=Date.now();setProgress(p);setStatus(message);}},
    onOutput:async(item,out,metadata)=>{
     if(!autoSave&&!onVideoReady)return;
     await uploads.add(async()=>{
      if(op!==operation.current)return;
      const warnings:string[]=[];
      if(autoSave){
       if(!originalIds.current.has(item.id))try{const saved=await saveFile(item.file,item.file.name,true,defaults,controller.signal);originalIds.current.set(item.id,saved.id);}catch(e){warnings.push('Original não salvo: '+mediaErrorMessage(e));}
       if(op!==operation.current)return;
       try{
        const saved=await saveFile(out.blob,out.name,false,out.settings,controller.signal,metadata);metadata.savedFileId=saved.id;
        if(op===operation.current){const url=rowsRef.current.find(row=>row.input.id===item.id)?.url;patchRow(item.id,{saved:saved.id,url:'/api/prisma/files/'+saved.id,blob:undefined,metadata:structuredClone(metadata)});if(url?.startsWith('blob:'))URL.revokeObjectURL(url);}
       }catch(e){warnings.push('Exportação não salva: '+mediaErrorMessage(e));}
      }
      if(autoSave&&onVideoReady&&metadata.savedFileId&&op===operation.current)try{await onVideoReady({metadata:structuredClone(metadata),blob:out.blob,signal:controller.signal});}catch(e){warnings.push('Falha na integração: '+mediaErrorMessage(e));}
      if(warnings.length&&op===operation.current)patchRow(item.id,{error:'Vídeo pronto. '+warnings.join(' · ')});
     });
    }
   });
  }catch(e){failure=mediaErrorMessage(e);}
  finally{
   if(op===operation.current)setStatus('Concluindo o salvamento e a entrega dos vídeos prontos…');
   try{await uploads.drain();}catch(e){failure=mediaErrorMessage(e);}
   if(op===operation.current){
    const ready=rowsRef.current.filter(row=>row.state==='done').length;
    setStatus(`${ready}/${plan.items.length} vídeos prontos${ready===plan.items.length?' · Lote concluído':'. Você pode retomar os pendentes.'}`);
    if(failure)setError(failure);
    try{await refreshFiles();}catch{setNotice('Os vídeos estão prontos. Não foi possível atualizar a lista da biblioteca.');}
    if(op===operation.current)onBusy(false);
   }
   if(controllerRef.current===controller)controllerRef.current=null;
  }
 };
 const cancel=()=>{
  if(!controllerRef.current)return;
  operation.current++;controllerRef.current.abort();controllerRef.current=null;cancelEngine();onBusy(false);
  replaceRows(rowsRef.current.map(row=>row.state==='pending'||row.state==='working'?{...row,state:'cancelled'}:row));
  setStatus('Operação cancelada. Os vídeos concluídos foram preservados.');
 };
 const ready=rows.filter(row=>row.state==='done'),pending=rows.filter(row=>row.state!=='done');
 const zip=async()=>{
  if(locked||!ready.length)return;setZipping(true);setError('');
  try{
   if(ready.reduce((total,row)=>total+(row.size||0),0)>512*1024*1024)throw Error('Este lote supera 512 MB. Baixe os vídeos individualmente.');
   const entries=[];
   for(const row of ready){let blob=row.blob;if(!blob)blob=await timedRequest(undefined,async signal=>{const response=await fetch(row.url!,{signal});if(!response.ok)throw Error('Não foi possível baixar '+row.name+'.');return response.blob();});entries.push({name:row.name!,blob});}
   const manifest=profileBatchManifest(planRef.current!.batchId,ready.flatMap(row=>row.metadata?[row.metadata]:[]));
   entries.push({name:'manifesto.json',blob:new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'})});
   const blob=await createZip(entries),name='prisma-videos-'+planRef.current!.batchId+'.zip';
   setArchive({url:URL.createObjectURL(blob),name});
  }catch(e){setError(mediaErrorMessage(e));}finally{setZipping(false);}
 };

 if(!active)return null;
 const geometry=profileGeometry(1080,1920,layout);
 return <>
  <div className="page-heading"><div><button className="back-link" onClick={back}><ArrowLeft size={15}/> Ferramentas</button><h1>Cloaker para spam · Vídeos em lote<span>.</span></h1><p>Vários vídeos. Uma modelo. O mesmo template e todos os ajustes do Avançado.</p></div><button className="secondary" disabled={locked} onClick={openTemplates}><AtSign size={16}/> Gerenciar templates</button></div>
  <div className="shared-library-actions"><LibraryPicker disabled={locked} videoOnly multiple onFiles={rows=>choose(rows.map(r=>r.file))}/></div><div className="profile-workflow"><span><b>1</b> Importar vídeos</span><i/><span><b>2</b> Uma modelo + ajustes</span><i/><span><b>3</b> Gerar o lote</span><strong>1080 × 1920 · REELS</strong></div>
  <div className="editor-layout"><section className="editor-stage">
   <section className="panel video-batch-inputs" aria-label="Vídeos de entrada">
    <div className="panel-heading"><h3><Film size={18}/> Vídeos de entrada · {inputs.length}/{MAX_BATCH_VIDEOS}</h3>{inputs.length>0&&<button disabled={locked} onClick={()=>{setInputs([]);setPreviewId('');setNotice('Fila de entrada limpa. Os resultados do último lote foram preservados.');}}><Trash2 size={14}/> Limpar fila</button>}</div>
    <input ref={picker} hidden multiple type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" aria-label="Importar vídeos em lote" onChange={e=>{choose(Array.from(e.target.files||[]));e.currentTarget.value='';}}/>
    <button className={'dropzone batch-dropzone '+(inputs.length?'compact':'')} disabled={locked} onClick={()=>picker.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(Array.from(e.dataTransfer.files));}}>
     <span className="upload-orb"><Upload size={25}/></span><h3>{inputs.length?'Adicionar mais vídeos':'Arraste seus vídeos para o lote'}</h3><p>Selecione vários arquivos de uma vez</p><span className="secondary"><Plus size={15}/> Importar vídeos</span><small>MP4, MOV ou WebM · Até 80 MB e 3 minutos por vídeo</small>
    </button>
    {inputs.length>0&&<><p className="batch-policy">{formatBytes(inputs.reduce((n,item)=>n+item.file.size,0))} de entrada · Selecione um vídeo para conferir a composição e a prévia.</p><div className="video-input-list">{inputs.map((item,index)=><div key={item.id} className={'video-input-row '+(source?.id===item.id?'selected':'')}>
     <button className="video-input-choice" disabled={locked} aria-pressed={source?.id===item.id} onClick={()=>setPreviewId(item.id)}><span className="input-number">{String(index+1).padStart(2,'0')}</span><span><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)}{source?.id===item.id?' · Na prévia':''}</small></span><Eye size={16}/></button>
     <button className="icon-button" disabled={locked} aria-label={'Remover '+item.file.name} onClick={()=>setInputs(current=>current.filter(value=>value.id!==item.id))}><Trash2 size={16}/></button>
    </div>)}</div></>}
   </section>
   <div className="panel template-picker"><div className="panel-heading"><h3><AtSign size={18}/> Uma modelo para todo o lote</h3><span>{templates.length} templates</span></div>{templates.length?<div className="template-selected">{template&&<ProfileAvatar src={templatePhoto(template)} crop={template.crop} label="Modelo selecionada"/>}<label>Template da modelo<select value={selected} disabled={locked} onChange={e=>setSelected(e.target.value)}>{templates.map(t=><option key={t.id} value={t.id}>@{t.handle}</option>)}</select></label><button className="icon-button" disabled={locked} onClick={openTemplates} aria-label="Adicionar template"><Plus size={20}/></button></div>:<div className="template-empty"><p>Cadastre a foto e o arroba da modelo para começar.</p><button className="primary" disabled={locked} onClick={openTemplates}><Plus size={15}/> Criar primeiro template</button></div>}</div>
   {source&&<div className="panel profile-source"><div className="panel-heading"><h3><Film size={18}/> Composição do vídeo selecionado</h3></div><div className="composition-stage"><div className="reel-composition"><video key={source.id} src={fileURL||undefined} controls playsInline preload="metadata" style={{top:(geometry.bodyY/1920*100)+'%',height:(geometry.bodyHeight/1920*100)+'%',objectFit:settings.fit==='blur'?'contain':'cover'}}/>{composition&&<img className="composition-overlay" src={composition} alt="Composição com o template escolhido"/>}</div><div className="composition-explainer"><span className="badge">UM PADRÃO PARA O LOTE</span><h3>{inputs.length} vídeos com a mesma identidade.</h3><p>{layout.mode==='fullscreen'?'Tela inteira, sem faixa. ':'Layout com faixa. '}A foto, o arroba e os ajustes serão aplicados a cada vídeo.</p><strong>{source.file.name}</strong><small>{formatBytes(source.file.size)}</small><p>A prévia abaixo mostra também as alterações de imagem, velocidade e áudio.</p></div></div>{compositionError&&<p className="error">{compositionError}</p>}<p className="template-source-note">Use vídeos sem a identidade de outro perfil já gravada na imagem.</p></div>}
   {source&&template&&<BeforeAfter preview={preview} kind={kind} setKind={setKind} start={start} setStart={setStart} isImage={false} busy={locked} stale={!!preview&&preview.signature!==signature(settings)} generate={()=>previewNow()}/>}
   {busy&&controllerRef.current&&<div className="progress-panel"><div><Loader2 className="spin" size={18}/><strong>{status}</strong><span>{Math.round(progress)}%</span><button onClick={cancel}><Square size={13}/> Cancelar</button></div><progress max={100} value={progress}/><small>Um vídeo por vez. Mantenha esta aba aberta até a conclusão.</small></div>}
   {!busy&&status&&<p className="info-strip" role="status">{status}</p>}{notice&&<p className="info-strip" role="status">{notice}</p>}{error&&<div className="error batch-message" role="alert">{error}</div>}
   {rows.length>0&&<section className="panel batch-results"><div className="panel-heading"><h3><Layers3 size={18}/> Lote de vídeos · {ready.length}/{rows.length} prontos</h3>{archive?<a className="secondary" href={archive.url} download={archive.name}><Download size={15}/> Baixar ZIP pronto</a>:<button disabled={locked||!ready.length} onClick={zip}>{zipping?<Loader2 className="spin" size={15}/>:<Download size={15}/>} {zipping?'Preparando ZIP…':'Preparar ZIP com todos'}</button>}<button disabled={locked||!ready.length} onClick={()=>download(new Blob([JSON.stringify(profileBatchManifest(planRef.current!.batchId,ready.flatMap(row=>row.metadata?[row.metadata]:[])),null,2)],{type:'application/json'}),'prisma-lote-'+planRef.current!.batchId+'.json')}><Download size={14}/> Manifesto do lote</button></div>
    <p className="batch-policy">@{planRef.current?.template.handle} · Mesma modelo, layout, imagem, velocidade e áudio. Um arquivo por vídeo de entrada.</p>
    {rows.map(row=><div className="batch-row video-result-row" key={row.input.id}><span className="input-number">{String(row.input.index).padStart(2,'0')}</span><div><strong>{row.input.file.name}</strong><small>{row.state==='working'?`Processando · ${Math.round(row.percent)}%`:row.state==='done'?`1080 × 1920 · ${formatBytes(row.size||0)}${row.saved?' · Salvo na biblioteca':''}`:row.state==='pending'?'Na fila':row.state==='cancelled'?'Pendente · processamento interrompido':'Falha neste vídeo'}</small>{row.name&&<small>{row.name}</small>}{row.error&&<small className="batch-warning">{row.error}</small>}{row.state==='working'&&<progress value={row.percent} max={100}/>}</div>{row.state==='done'?<><a className="secondary" href={row.url+(row.saved?'?download':'')} download={row.name}><Download size={14}/> Baixar</a>{row.saved&&<a className="secondary" href={firmaComposerURL(row.saved!)}>Criar conteúdo</a>}<CheckCircle2 className="batch-success" size={19}/></>:row.state==='working'?<Loader2 className="spin" size={19}/>:row.state==='error'?<AlertCircle className="danger" size={19}/>:<Clock3 size={18}/>}</div>)}
    {pending.length>0&&!busy&&<div className="batch-retry-wrap"><button className="secondary" disabled={locked} onClick={()=>generate(true)}><RefreshCw size={15}/> Retomar {pending.length} pendentes</button><small>Usa a modelo e os ajustes do lote original. Os vídeos prontos são mantidos.</small></div>}
   </section>}
  </section><Controls tool="profile" s={settings} set={update} busy={locked} hasFile={!!inputs.length&&!!template} save={autoSave} setSave={setAutoSave} process={()=>generate()} processLabel={`Gerar lote (${inputs.length} vídeos)`} inspect={()=>{}} randomize={randomize} extra={<div className="control-group profile-layout-controls"><h4><Settings2 size={14}/> TEMPLATE DO VÍDEO</h4><label>Modo de exportação<select value={settings.profileEncoding||'fast'} onChange={e=>update({...settings,profileEncoding:e.target.value as 'fast'|'balanced'})}><option value="fast">Rápido · arquivos maiores</option><option value="balanced">Equilibrado · arquivos menores</option></select></label><p className="field-note">1080 × 1920, 30 fps. Todos os vídeos usam a mesma modelo e os mesmos ajustes. Randomizar define uma combinação para o lote inteiro.</p><VideoLayoutControls layout={layout} change={changeLayout}/></div>}/></div>
 </>;
}
