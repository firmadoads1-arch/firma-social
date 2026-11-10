'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,AtSign,Upload,Plus,Film,RefreshCw,Layers3,Download,Loader2,CheckCircle2,AlertCircle,Clock3,Square,Settings2} from 'lucide-react';
import Controls from './controls';
import VideoLayoutControls from './video-layout-controls';
import {operationId} from '../../lib/prisma/operation-id';
import BeforeAfter,{type PreviewView} from './before-after';
import {api,firmaComposerURL} from '../../lib/prisma/client-api';
import {defaults,formatBytes,type Settings} from '../../lib/prisma/catalog';
import {processMedia,cancelEngine,inspect} from '../../lib/prisma/media';
import {isEngineStartupError,isEngineCommandError,mediaErrorMessage} from '../../lib/prisma/media-errors';
import {randomizeSettings} from '../../lib/prisma/randomize';
import {renderProfileLayer} from '../../lib/prisma/profile-layout';
import {detectProfileCrop} from '../../lib/prisma/face-crop';
import ProfileAvatar from './profile-avatar';
import {defaultProfileLayout,normalizeProfileLayout,profileGeometry,templatePhoto,type ProfileTemplate,type ProfileRender,type ProfileLayout} from '../../lib/prisma/profile-types';
import {profileOutputMetadata,profileBatchManifest,type ProfileOutputMetadata,type ProfileVideoReadyHandler} from '../../lib/prisma/profile-handoff';
import {createZip} from '../../lib/prisma/zip';
import {BackgroundTasks} from '../../lib/prisma/background-tasks';
type Job={template:ProfileTemplate;state:'pending'|'working'|'done'|'error'|'cancelled';percent:number;avatarURL?:string;url?:string;blob?:Blob;name?:string;size?:number;saved?:string;error?:string;metadata?:ProfileOutputMetadata};
const initial=():Settings=>({...defaults,profileEncoding:'fast',ratio:'9:16',maxSide:1920,profileLayout:{...defaultProfileLayout}});
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
export default function ProfileStudio({active,templates,file,onFile,busy,onBusy,openTemplates,back,refreshFiles,onVideoReady}:{active:boolean;templates:ProfileTemplate[];file:File|null;onFile:(file:File)=>void;busy:boolean;onBusy:(value:boolean)=>void;openTemplates:()=>void;back:()=>void;refreshFiles:()=>Promise<void>;onVideoReady?:ProfileVideoReadyHandler}){
 const [settings,setSettings]=useState<Settings>(initial),[selected,setSelected]=useState(''),[fileURL,setFileURL]=useState(''),[composition,setComposition]=useState(''),[compositionError,setCompositionError]=useState(''),[autoSave,setAutoSave]=useState(true),[jobs,setJobs]=useState<Job[]>([]),[progress,setProgress]=useState(0),[status,setStatus]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState<PreviewView|null>(null),[kind,setKind]=useState<'image'|'video'>('image'),[start,setStart]=useState(0),[zipping,setZipping]=useState(false);
 const input=useRef<HTMLInputElement>(null),operation=useRef(0),jobRef=useRef<Job[]>([]),avatars=useRef(new Map<string,Promise<ProfileRender>>()),originalId=useRef<string|null>(null),batchSettings=useRef<Settings>(initial()),saveAbort=useRef<AbortController|null>(null);jobRef.current=jobs;
 const batchId=useRef('');
 const template=templates.find(t=>t.id===selected),layout=normalizeProfileLayout(settings.profileLayout);
 const signature=(s:Settings)=>JSON.stringify({s,template:template?.id,updated:template?.updated,kind,start});
 const revokeJobs=()=>{for(const job of jobRef.current){if(job.url?.startsWith('blob:'))URL.revokeObjectURL(job.url);if(job.avatarURL)URL.revokeObjectURL(job.avatarURL);}};
 useEffect(()=>{if(!templates.some(t=>t.id===selected))setSelected(templates[0]?.id||'');const valid=new Set(templates.map(t=>t.id+':'+t.updated));for(const key of avatars.current.keys())if(!valid.has(key))avatars.current.delete(key);},[templates,selected]);
 useEffect(()=>{setPreview(null);setStart(0);setError('');originalId.current=null;revokeJobs();setJobs([]);if(!file){setFileURL('');return;}const url=URL.createObjectURL(file);setFileURL(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>()=>{revokeJobs();saveAbort.current?.abort();},[]);
 useEffect(()=>()=>{if(preview){URL.revokeObjectURL(preview.beforeURL);URL.revokeObjectURL(preview.afterURL);}},[preview]);
 const loadProfile=(t:ProfileTemplate)=>{const key=t.id+':'+t.updated;let cached=avatars.current.get(key);if(!cached){cached=(async()=>{const response=await fetch(templatePhoto(t));if(!response.ok)throw Error(response.status===401?'Sua sessão expirou. Entre novamente.':'Não foi possível carregar a foto de @'+t.handle+'.');const avatar=await response.blob(),crop=t.crop||(await detectProfileCrop(avatar)).crop;return{id:t.id,handle:t.handle,avatar,crop};})().catch(error=>{avatars.current.delete(key);throw error;});avatars.current.set(key,cached);}return cached;};
 useEffect(()=>{let stopped=false,url='';setComposition('');setCompositionError('');if(!active||!template)return;void(async()=>{try{const profile=await loadProfile(template),bytes=await renderProfileLayer(profile,360,640,layout);if(stopped)return;url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'image/png'}));setComposition(url);}catch(e){if(!stopped)setCompositionError(mediaErrorMessage(e));}})();return()=>{stopped=true;if(url)URL.revokeObjectURL(url);};},[active,template?.id,template?.updated,JSON.stringify(layout)]);
 const choose=(f?:File)=>{if(!f||busy)return;if(!f.type.startsWith('video/')&&!/\.(mp4|mov|webm)$/i.test(f.name)){setError('Selecione um vídeo MP4, MOV ou WebM.');return;}if(f.size>80*1024*1024){setError('Selecione um vídeo de até 80 MB.');return;}onFile(f);};
 const update=(next:Settings)=>setSettings({...next,ratio:'9:16',maxSide:1920,profileLayout:normalizeProfileLayout(next.profileLayout)});
 const changeLayout=(patch:Partial<ProfileLayout>)=>update({...settings,profileLayout:{...layout,...patch}});
 const previewNow=async(next:Settings=settings)=>{if(!file||!template||busy)return;const op=++operation.current;onBusy(true);setError('');setProgress(0);try{setStatus('Preparando o template…');const profile=await loadProfile(template);if(op!==operation.current)return;const [out]=await processMedia(file,'profile',next,(p,m)=>{if(op===operation.current){setProgress(p);setStatus(m);}}, {kind,start},profile);if(op!==operation.current)return;setPreview({beforeURL:URL.createObjectURL(out.preview!.before),afterURL:URL.createObjectURL(out.blob),kind:out.preview!.kind,start:out.preview!.start,sourceDuration:out.preview!.sourceDuration,afterDuration:out.info.duration,firstVariant:false,signature:signature(next)});setStatus('Prévia pronta');}catch(e){if(op===operation.current)setError(mediaErrorMessage(e));}finally{if(op===operation.current)onBusy(false);}};
 const randomize=()=>{const next=randomizeSettings(settings,'profile');next.profileLayout={...layout,opacity:(10+(next.randomSeed||0)%6)/100};update(next);if(file&&template)void previewNow(next);};
 const saveMedia=(blob:Blob,name:string,kind:string,s:Settings,signal?:AbortSignal,metadata?:ProfileOutputMetadata)=>api('files?'+new URLSearchParams({name,tool:kind==='original'?'original':'profile',kind,settings:JSON.stringify(s),...(metadata?{metadata:JSON.stringify(metadata)}:{})}),{method:'POST',headers:{'Content-Type':blob.type},body:blob,signal});
 const generate=async(targets:ProfileTemplate[],retry=false)=>{
  if(!file||!targets.length||busy)return;
  const snapshot=structuredClone(retry?batchSettings.current:settings),source=file,list=targets.map(t=>({...t})),op=++operation.current;
  if(!retry)batchId.current=operationId();const currentBatch=batchId.current;
  const completed=retry?jobRef.current.filter(job=>job.state==='done'):[],offset=completed.length;if(!retry)revokeJobs();else for(const job of jobRef.current)if(job.state!=='done'&&job.avatarURL)URL.revokeObjectURL(job.avatarURL);batchSettings.current=snapshot;setJobs([...completed,...list.map(t=>({template:t,state:'pending' as const,percent:0}))]);setError('');setProgress(0);onBusy(true);
  const patch=(index:number,value:Partial<Job>)=>{if(op===operation.current)setJobs(rows=>rows.map((row,i)=>i===offset+index?{...row,...value}:row));};
  const uploads=new BackgroundTasks(2),controller=new AbortController();saveAbort.current=controller;
  let saveWarning='',lastUpdate=0,lastMessage='';
  try{
   // Initialize and validate once, before uploading or iterating over profiles.
   // A startup failure must not repeat the same wait for every row.
   setStatus('Preparando o motor para o lote…');
   const info=await inspect(source,(p,message)=>{if(op===operation.current){setStatus(message);setProgress(Math.min(10,p));}});
   if(op!==operation.current)return;
   if(!info.video||info.image)throw Error('Selecione um vídeo válido para o lote.');
   if(info.duration>180)throw Error('Use um vídeo de até 3 minutos.');
   if(info.width*info.height>16777216)throw Error('Use um vídeo de até 16 megapixels.');
   if(autoSave&&!originalId.current)await uploads.add(async()=>{if(op!==operation.current)return;try{const saved=await saveMedia(source,source.name,'original',defaults,controller.signal);if(op===operation.current)originalId.current=saved.id;}catch(e){if(op===operation.current)saveWarning='Original não salvo: '+mediaErrorMessage(e);}});
   for(let index=0;index<list.length;index++){
    if(op!==operation.current)break;
    const target=list[index];patch(index,{state:'working',percent:0});setStatus(`Perfil ${index+1} de ${list.length} · @${target.handle}`);
    try{
     const profile=await loadProfile(target);if(op!==operation.current)break;patch(index,{avatarURL:URL.createObjectURL(profile.avatar),template:{...target,crop:profile.crop}});
     if(list[index+1])void loadProfile(list[index+1]).catch(()=>{});
     const [out]=await processMedia(source,'profile',snapshot,(p,message)=>{if(op!==operation.current||message===lastMessage&&Date.now()-lastUpdate<150&&p<100)return;lastUpdate=Date.now();lastMessage=message;patch(index,{percent:Math.round(p)});setProgress((index+p/100)/list.length*100);setStatus(`@${target.handle} · ${message}`);},undefined,profile);
     if(op!==operation.current)break;
     const name=out.name,url=URL.createObjectURL(out.blob),metadata=profileOutputMetadata(currentBatch,operationId(),{id:target.id,handle:target.handle},out);
     patch(index,{state:'done',percent:100,url,blob:out.blob,name,size:out.blob.size,metadata});
     if(autoSave||onVideoReady)await uploads.add(async()=>{
      if(op!==operation.current)return;const warnings:string[]=[];
      if(autoSave)try{const saved=await saveMedia(out.blob,name,'export',out.settings,controller.signal,metadata);metadata.savedFileId=saved.id;if(op===operation.current){patch(index,{saved:saved.id,url:'/api/prisma/files/'+saved.id,blob:undefined,metadata:{...metadata}});URL.revokeObjectURL(url);}}catch(e){warnings.push('Não foi salvo: '+mediaErrorMessage(e));}
      if(autoSave&&onVideoReady&&metadata.savedFileId&&op===operation.current)try{await onVideoReady({metadata:structuredClone(metadata),blob:out.blob,signal:controller.signal});}catch(e){warnings.push('Falha na integração: '+mediaErrorMessage(e));}
      if(warnings.length&&op===operation.current)patch(index,{error:'Vídeo pronto. '+warnings.join(' · ')});
     });
    }catch(e){if(op===operation.current)patch(index,{state:'error',error:mediaErrorMessage(e)});if(isEngineStartupError(e)||isEngineCommandError(e))throw e;}
    if(op===operation.current)setProgress((index+1)/list.length*100);
   }
   if(op===operation.current&&(autoSave||onVideoReady))setStatus(onVideoReady?'Concluindo o salvamento e a entrega ao gerenciador…':'Concluindo o salvamento na biblioteca…');
   await uploads.drain();
   if(op===operation.current){setStatus('Processamento do lote encerrado');if(saveWarning)setError(saveWarning);}
   await refreshFiles();
  }catch(e){
   controller.abort();
   if(op===operation.current){const message=mediaErrorMessage(e);setError(message);setStatus('Lote interrompido. Os vídeos concluídos foram preservados.');setJobs(rows=>rows.map(row=>row.state==='pending'||row.state==='working'?{...row,state:'cancelled',error:message}:row));}
  }finally{await uploads.drain().catch(()=>{});if(saveAbort.current===controller)saveAbort.current=null;if(op===operation.current)onBusy(false);}
 };
 const cancel=()=>{operation.current++;saveAbort.current?.abort();cancelEngine();onBusy(false);setStatus('Operação cancelada. Os vídeos concluídos foram preservados.');setJobs(rows=>rows.map(row=>row.state==='pending'||row.state==='working'?{...row,state:'cancelled'}:row));};
 const allReady=jobs.filter(job=>job.state==='done'),failed=jobs.filter(job=>job.state==='error'||job.state==='cancelled');
 const zip=async()=>{if(zipping||!allReady.length)return;setZipping(true);setError('');try{if(allReady.reduce((n,job)=>n+(job.size||0),0)>512*1024*1024)throw Error('Este lote supera 512 MB. Baixe os vídeos individualmente.');const entries=[];for(const job of allReady){let blob=job.blob;if(!blob){const response=await fetch(job.url!);if(!response.ok)throw Error('Não foi possível baixar @'+job.template.handle+'.');blob=await response.blob();}entries.push({name:job.name!,blob});}download(await createZip(entries),'prisma-perfis-'+Date.now()+'.zip');}catch(e){setError(mediaErrorMessage(e));}finally{setZipping(false);}};
 if(!active)return null;
 const geometry=profileGeometry(1080,1920,layout);
 return <><div className="page-heading"><div><button className="back-link" onClick={back}><ArrowLeft size={15}/> Ferramentas</button><h1>Cloaker Avançado para spam<span>.</span></h1><p>Um vídeo base. Seus perfis. O mesmo padrão em todas as versões.</p></div><button className="secondary" disabled={busy} onClick={openTemplates}><AtSign size={16}/> Gerenciar templates</button></div>
 <div className="profile-workflow"><span><b>1</b> Vídeo base</span><i/><span><b>2</b> Template + ajustes</span><i/><span><b>3</b> Exportar um ou todos</span><strong>1080 × 1920 · REELS</strong></div>
 <div className="editor-layout"><section className="editor-stage">
 <div className="panel template-picker"><div className="panel-heading"><h3><AtSign size={18}/> Perfil da prévia</h3><span>{templates.length} templates</span></div>{templates.length?<div className="template-selected">{template&&<ProfileAvatar src={templatePhoto(template)} crop={template.crop} label="Foto do perfil selecionado"/>}<label>Selecione a identidade<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}>{templates.map(t=><option key={t.id} value={t.id}>@{t.handle}</option>)}</select></label><button className="icon-button" disabled={busy} onClick={openTemplates} aria-label="Adicionar template"><Plus size={20}/></button></div>:<div className="template-empty"><p>Cadastre a foto e o arroba para começar.</p><button className="primary" onClick={openTemplates}><Plus size={15}/> Criar primeiro template</button></div>}</div>
 <div className="panel profile-source"><div className="panel-heading"><h3><Film size={18}/> Vídeo base e composição</h3>{file&&<button disabled={busy} onClick={()=>input.current?.click()}>Trocar vídeo <RefreshCw size={14}/></button>}</div><input ref={input} hidden type="file" accept="video/mp4,video/quicktime,video/webm" onChange={e=>{choose(e.target.files?.[0]);e.currentTarget.value='';}}/>
{file?<><div className="composition-stage"><div className="reel-composition"><video src={fileURL} controls playsInline preload="metadata" style={{top:(geometry.bodyY/1920*100)+'%',height:(geometry.bodyHeight/1920*100)+'%',objectFit:settings.fit==='blur'?'contain':'cover'}}/>{composition&&<img className="composition-overlay" src={composition} alt="Posições do template de perfil"/>}{!template&&<div className="composition-placeholder">Selecione um template</div>}</div><div className="composition-explainer"><span className="badge">LAYOUT AUTOMÁTICO</span><h3>Seu padrão já está no lugar.</h3><p>{layout.mode==='fullscreen'?'Vídeo em tela inteira, sem faixa. ':'Composição com faixa. '}{layout.showAvatar?'Foto circular visível. ':'Foto circular oculta. '}Foto translúcida a {Math.round(layout.opacity*100)}%. Arroba {layout.showHandle?'visível':'oculto'}.</p><p>Esta composição mostra as posições. Gere a prévia abaixo para conferir também cores, ritmo e áudio.</p><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div></div>{compositionError&&<p className="error">{compositionError}</p>}</>:<button className="dropzone" disabled={busy} onClick={()=>input.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(e.dataTransfer.files[0]);}}><span className="upload-orb"><Upload size={26}/></span><h3>Selecione o vídeo que todos os perfis vão usar</h3><p>MP4, MOV ou WebM · Até 80 MB e 3 minutos</p><span className="secondary">Selecionar vídeo <Plus size={15}/></span></button>}
 <p className="template-source-note">Use um vídeo base sem foto ou arroba já gravados na imagem. O template acrescenta a nova identidade.</p></div>
 {file&&template&&<BeforeAfter preview={preview} kind={kind} setKind={setKind} start={start} setStart={setStart} isImage={false} busy={busy} stale={!!preview&&preview.signature!==signature(settings)} generate={()=>previewNow()}/>}
 {busy&&<div className="progress-panel"><div><Loader2 className="spin" size={18}/><strong>{status}</strong><span>{Math.round(progress)}%</span><button onClick={cancel}><Square size={13}/> Cancelar</button></div><progress max={100} value={progress}/><small>Os perfis são processados um por vez. Mantenha esta aba aberta.</small></div>}
 {!busy&&status.startsWith('Operação cancelada')&&<p className="info-strip" role="status">{status}</p>}
 {error&&<div className="error" role="alert">{error}</div>}
 {jobs.length>0&&<section className="panel batch-results"><div className="panel-heading"><h3><Layers3 size={18}/> Lote · {allReady.length}/{jobs.length} prontos</h3><button disabled={busy||zipping||!allReady.length} onClick={zip}>{zipping?<Loader2 className="spin" size={15}/>:<Download size={15}/>} Baixar todos (.zip)</button><button disabled={busy||!allReady.length} onClick={()=>download(new Blob([JSON.stringify(profileBatchManifest(batchId.current,allReady.flatMap(job=>job.metadata?[job.metadata]:[])),null,2)],{type:'application/json'}),'prisma-lote-'+batchId.current+'.json')}><Download size={14}/> Manifesto do lote</button></div><p className="batch-policy">Mesmos ajustes de imagem, velocidade e áudio. Uma identidade por arquivo.</p>{jobs.map(job=><div className="batch-row" key={job.template.id}><ProfileAvatar src={job.avatarURL||templatePhoto(job.template)} crop={job.template.crop} label={"Foto de @"+job.template.handle}/><div><strong>@{job.template.handle}</strong><small>{job.state==='working'?`Processando · ${job.percent}%`:job.state==='done'?`1080 × 1920 · ${formatBytes(job.size||0)}${job.saved?' · Salvo na biblioteca':''}`:job.state==='pending'?'Na fila':job.state==='cancelled'?'Cancelado':job.error}</small>{job.state==='done'&&job.error&&<small className="batch-warning">{job.error}</small>}{job.state==='working'&&<progress value={job.percent} max={100}/>}</div>{job.state==='done'?<><a className="secondary" href={job.url+(job.saved?'?download':'')} download={job.name}><Download size={14}/> Baixar</a>{job.saved&&<a className="secondary" href={firmaComposerURL(job.saved!)}>Criar conteúdo</a>}<CheckCircle2 className="batch-success" size={19}/></>:job.state==='working'?<Loader2 className="spin" size={19}/>:job.state==='error'?<AlertCircle className="danger" size={19}/>:<Clock3 size={18}/>}</div>)}{failed.length>0&&!busy&&<button className="secondary batch-retry" onClick={()=>generate(failed.map(job=>job.template),true)}><RefreshCw size={15}/> Gerar novamente os {failed.length} pendentes</button>}</section>}
</section><Controls tool="profile" s={settings} set={update} busy={busy} hasFile={!!file&&!!template} save={autoSave} setSave={setAutoSave} process={()=>template&&generate([template])} processAll={()=>generate(templates)} templateCount={templates.length} inspect={()=>file&&inspect(file,()=>{})} randomize={randomize} extra={<div className="control-group profile-layout-controls"><h4><Settings2 size={14}/> TEMPLATE DO VÍDEO</h4><label>Modo de exportação<select value={settings.profileEncoding||'fast'} onChange={e=>update({...settings,profileEncoding:e.target.value as 'fast'|'balanced'})}><option value="fast">Rápido · arquivos maiores</option><option value="balanced">Equilibrado · arquivos menores</option></select></label><p className="field-note">1080 × 1920, 30 fps. O template e os ajustes valem para todas as modelos do lote.</p><VideoLayoutControls layout={layout} change={changeLayout}/></div>}/></div>
 </>;
}
