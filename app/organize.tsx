'use client';
import {useEffect,useMemo,useState,useRef} from 'react';
import {Layers,Folder,FolderPlus,Trash2,Video,ChevronLeft,ChevronRight,ArrowUp,ArrowDown,MapPin,Image as ImageIcon,Check} from 'lucide-react';
import type {AppState,Account,Media} from '@/lib/domain';
import {localToEpoch,formatBytes} from '@/lib/domain';
import {defaultLocation,saoPauloPage,usableCover} from '@/lib/editor-defaults';
import {SHARED_REEL_INTERVAL_MS,sharedReelFolder} from '@/lib/prisma/shared-reel';
import {Field,Modal,Thumb,dateInput,formatDate,requestJSON,type Mutate} from './ui';

function ActionError({message}:{message:string}){return <div className="error" role="alert">{message}{/proprietário autenticado|exige o proprietário/.test(message)&&<p><a className="text-link" target="_top" href={'/signin-with-chatgpt?return_to='+encodeURIComponent(window.location.pathname+window.location.search)}>Entrar como proprietário</a></p>}</div>;}
export function LocationFields({value,onChange,native,story=false}:{value:any;onChange:(patch:any)=>void;native:boolean;story?:boolean}){
 const mode=value.locationMode??'none';return <section className="options-panel"><h4><MapPin size={16}/> Localização</h4>{story?<><label className="check"><input type="checkbox" checked={mode==='sticker'} onChange={e=>onChange({locationMode:e.target.checked?'sticker':'none',location:value.location||defaultLocation})}/>Planejar Story com adesivo de localização</label>{mode==='sticker'&&<Field label="Local do adesivo" hint="O Firma guarda o local e o horário. No Instagram, você escolhe esse lugar e publica o Story manualmente."><input maxLength={100} value={value.location??defaultLocation} onChange={e=>onChange({location:e.target.value})}/></Field>}</>:<>
 <Field label="Como mostrar o local"><select value={mode} onChange={e=>onChange({locationMode:e.target.value,location:value.location||defaultLocation,placeId:value.placeId??((value.location||defaultLocation)===defaultLocation?saoPauloPage:null)})}>
 <option value="caption">Escrever na legenda</option><option value="native" disabled={!native}>Marcar local no Instagram{native?'':' · requer Página vinculada'}</option><option value="none">Sem localização</option></select></Field>
 {mode!=='none'&&<Field label="Local" hint={mode==='caption'?'A publicação inclui 📍 e o nome do local na legenda.':'O Instagram exibe o local clicável quando a Página do lugar tem coordenadas válidas.'}><input value={value.location??defaultLocation} maxLength={100} placeholder={defaultLocation} onChange={e=>onChange({location:e.target.value,placeId:e.target.value.trim()===defaultLocation?saoPauloPage:null})}/></Field>}
 {mode==='native'&&<Field label="ID da Página do local" hint="Para outro lugar, use o ID da Página de localização correspondente no Facebook."><input inputMode="numeric" value={value.placeId??''} onChange={e=>onChange({placeId:e.target.value.replace(/[^0-9]/g,'').slice(0,25)||null})}/></Field>}</>}</section>;
}
export function Pager({count,limit,page,setPage}:{count:number;limit:number;page:number;setPage:(n:number)=>void}){const max=Math.max(1,Math.ceil(count/limit));if(max<2)return null;const at=Math.min(page,max);return <div className="firma-pager"><span>{(at-1)*limit+1}–{Math.min(at*limit,count)} de {count}</span><button className="icon-button" aria-label="Página anterior" disabled={at===1} onClick={()=>setPage(at-1)}><ChevronLeft size={17}/></button><button className="icon-button" aria-label="Próxima página" disabled={at===max} onClick={()=>setPage(at+1)}><ChevronRight size={17}/></button></div>}
export function GroupManager({state,mutate,onClose,onEdit}:{state:AppState;mutate:Mutate;onClose:()=>void;onEdit:(a:Account)=>void}){
 const [name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const [marked,setMarked]=useState<string[]>([]),[dest,setDest]=useState('');
 async function create(){setBusy(true);setError('');try{await mutate('group.create',{name});setName('');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <Modal title="Grupos e perfis" onClose={onClose}><div className="modal-body"><p className="muted">Geral reúne todas as contas. Cada grupo tem seu próprio painel, biblioteca, conteúdo, desempenho e rotinas.</p><div className="firma-inline"><Field label="Novo grupo"><input placeholder="Ex.: Modelo 1" maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></Field><button className="button primary" disabled={busy||!name.trim()} onClick={create}><FolderPlus size={16}/> Criar</button></div>{!!state.groups?.length&&<div className="firma-tags">{state.groups.map(g=><a key={g.id} href={'/?group='+g.id}><Folder size={13}/>{g.name}</a>)}</div>}
 <Field label="Organizar perfis"><input type="search" placeholder="Buscar @perfil" value={search} onChange={e=>setSearch(e.target.value)}/></Field><div className="firma-list">{state.accounts.filter(a=>a.username.toLowerCase().includes(search.toLowerCase())).map(a=><div className="firma-entry" key={a.id}><input type="checkbox" aria-label={'Selecionar @'+a.username} checked={marked.includes(a.id)} onChange={e=>setMarked(e.target.checked?[...marked,a.id]:marked.filter(id=>id!==a.id))}/><button className="text-button" onClick={()=>onEdit(a)}>@{a.username}</button><span>{state.groups?.find(x=>x.id===a.groupId)?.name??'Sem grupo'}</span></div>)}</div>{marked.length>0&&<div className="firma-inline"><Field label="Grupo de destino"><select value={dest} onChange={e=>setDest(e.target.value)}><option value="">Sem grupo</option>{state.groups?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><button className="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await mutate('group.assign',{ids:marked,groupId:dest||null});setMarked([]);}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>Mover {marked.length} perfil(is)</button></div>}{state.groupId&&<a className="text-button" href="/?view=accounts">Ver todos os perfis em Geral</a>}{error&&<ActionError message={error}/>}</div></Modal>;
}
export function Preferences({a,state,mutate,onClose}:{a:Account;state:AppState;mutate:Mutate;onClose:()=>void}){
 const [g,setG]=useState(a.groupId??''),[cover,setCover]=useState(a.coverMediaId??''),[extra,setExtra]=useState<Media|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[geo,setGeo]=useState(!!a.nativeLocation);const secret=useRef<HTMLInputElement>(null);
 const pics=[...state.media,...(extra&&!state.media.some(x=>x.id===extra.id)?[extra]:[])].filter(m=>usableCover(m)&&(!m.groupId||m.groupId===g));const current=pics.find(m=>m.id===cover);
 async function upload(f:File){setBusy(true);try{if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8*1024*1024)throw Error('Use JPG, PNG ou WebP de até 8 MB.');let file=f;if(f.type!=='image/jpeg'){const image=await createImageBitmap(f);const scale=Math.min(1,1080/image.width,1920/image.height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');if(!ctx){image.close();throw Error('Não foi possível abrir a imagem.');}ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível preparar o JPG.')),'image/jpeg',.92));file=new File([jpeg],a.username.replace(/^@/,'')+'.jpg',{type:'image/jpeg'});}const data=new FormData();data.set('file',file);if(g)data.set('group',g);const r=await requestJSON('/api/upload',{method:'POST',body:data});setExtra({id:r.id,name:file.name,mime:file.type,size:file.size,width:null,height:null,duration:null,folder:'Geral',publicUrl:null,groupId:g||null,createdAt:Date.now()});setCover(r.id);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <Modal title={'Preferências de @'+a.username} onClose={onClose}><div className="modal-body"><Field label="Grupo"><select value={g} onChange={e=>{setG(e.target.value);}}><option value="">Sem grupo</option>{state.groups?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>{a.platform==='instagram'&&<><Field label="Capa padrão dos Reels" hint={'No modo automático, o Firma procura '+a.username.replace(/^@/,'')+'.jpg. Você pode trocar a capa ao criar um post.'}><select value={cover} onChange={e=>setCover(e.target.value)}><option value="">Automática · pelo nome do perfil</option>{cover&&!current&&<option value={cover}>{a.resolvedCoverName??'Capa cadastrada'}</option>}{pics.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></Field><Field label="Ou cadastrar uma imagem" hint="PNG e WebP são convertidos para JPG."><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/></Field>{(current||a.resolvedCoverId)&&<div className="firma-cover"><img alt="Capa do perfil" src={'/api/media/'+(current?.id??a.resolvedCoverId)}/><span>{current?.name??a.resolvedCoverName}</span></div>}
 <details className="firma-details"><summary>Marcação nativa de localização {geo?'· Página vinculada':''}</summary><p>Opcional. Para marcar um lugar clicável, use um token de acesso da Página do Facebook vinculada a este Instagram, com permissão de publicação do Instagram. Só o proprietário pode vincular a Página. A conexão atual continua disponível.</p><Field label="Token da Página"><input type="password" ref={secret} autoComplete="off"/></Field><button className="button small" disabled={busy} onClick={async()=>{const token=secret.current?.value??'';if(secret.current)secret.current.value='';setBusy(true);setError('');try{await mutate('account.geo',{id:a.id,token});setGeo(true);}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>Verificar e vincular Página</button></details></>}{error&&<ActionError message={error}/>}</div><div className="modal-footer"><button className="button" onClick={onClose}>Voltar</button><button className="button primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await mutate('account.preferences',{id:a.id,groupId:g||null,coverMediaId:cover||null});onClose();}catch(e:any){setError(e.message);setBusy(false);}}}>Salvar preferências</button></div></Modal>;
}
export function AssetList({state,media,mutate,details,batch,notice}:{state:AppState;media:Media[];mutate:Mutate;details:(m:Media)=>void;batch:(ids:string[])=>void;notice:(s:string)=>void}){
 const [selected,select]=useState<string[]>([]),[page,setPage]=useState(1),[op,setOp]=useState(''),[folder,setFolder]=useState(''),[dest,setDest]=useState('keep'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const idx=useMemo(()=>new Map(media.map(m=>[m.id,m])),[media]),ids=selected.filter(id=>idx.has(id)),set=new Set(ids),max=Math.max(1,Math.ceil(media.length/36)),p=Math.min(page,max);
 const videos=ids.length>0&&ids.every(id=>['video/mp4','video/quicktime'].includes(idx.get(id)!.mime));
 function toggle(id:string){select(set.has(id)?ids.filter(k=>k!==id):[...ids,id]);}
 async function apply(){setBusy(true);setError('');try{const r=await mutate(op==='move'?'media.move':'media.remove',{ids,folder,destination:dest==='keep'?undefined:dest||null});notice(op==='move'?r.moved+' arquivo(s) movido(s).':r.removed+' excluído(s) · '+r.protected+' protegido(s) ou indisponível(is).');setOp('');select([]);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <><div className="firma-selection"><label><input type="checkbox" checked={!!media.length&&ids.length===media.length} onChange={e=>select(e.target.checked?media.map(m=>m.id):[])}/>Selecionar todos ({media.length})</label><span>{ids.length} selecionado(s)</span><button className="button small" disabled={!ids.length} onClick={()=>{setError('');setOp('move');}}><Folder size={15}/>Mover</button><button className="button small" disabled={!ids.length} onClick={()=>{setError('');setOp('delete');}}><Trash2 size={15}/>Excluir</button>{videos&&<button className="button small" onClick={()=>batch(ids)}><Layers size={15}/>Agendar lote</button>}</div><div className="media-grid">{media.slice((p-1)*36,p*36).map(m=><article key={m.id} className={'media-card firma-asset '+(set.has(m.id)?'chosen':'')}><label className="firma-check"><input type="checkbox" aria-label={'Selecionar '+m.name} checked={set.has(m.id)} onChange={()=>toggle(m.id)}/></label><button className="firma-asset-open" onClick={()=>details(m)}><div className="media-cover"><Thumb media={m}/><span className="media-type">{m.mime.startsWith('video/')?'VÍDEO':'IMAGEM'}</span></div><div className="media-info"><strong>{m.name}</strong><span>{m.folder} · {formatBytes(m.size)}</span></div></button></article>)}</div><Pager count={media.length} limit={36} page={page} setPage={setPage}/>
 {op&&<Modal title={op==='move'?'Mover arquivos':'Excluir arquivos selecionados?'} onClose={()=>{if(!busy)setOp('');}}><div className="modal-body">{op==='move'?<><Field label="Pasta de destino" hint="Digite um nome para criar uma pasta ou escolha uma existente."><input list="folder-options" maxLength={60} value={folder} onChange={e=>setFolder(e.target.value)}/></Field><Field label="Área de destino"><select value={dest} onChange={e=>setDest(e.target.value)}><option value="keep">Manter grupo de cada arquivo</option><option value="">Geral · sem grupo</option>{state.groups?.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></Field></>:<p>Você selecionou {ids.length} arquivo(s). A exclusão é permanente. Arquivos usados por conteúdos, rotinas ou capas serão preservados.</p>}{error&&<ActionError message={error}/>}</div><div className="modal-footer"><button className="button" disabled={busy} onClick={()=>setOp('')}>Voltar</button><button className={'button '+(op==='move'?'primary':'danger')} disabled={busy||(op==='move'&&!folder.trim())} onClick={apply}>{op==='move'?'Mover':'Excluir'} {ids.length} arquivo(s)</button></div></Modal>}</>;
}
function useBatchSubmission(state:AppState,mutate:Mutate,done:(count:number,startsAt?:number)=>void){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const sending=useRef(false);
 async function submit(action:string,fields:Record<string,unknown>,prepare?:(requestId:string)=>Promise<void>){
  if(sending.current)return;
  sending.current=true;setBusy(true);setError('');
  let requestId:string=crypto.randomUUID();
  try{
   const key=action==='post.batch'?JSON.stringify(fields):JSON.stringify([state.groupId??null,action,fields]);
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(v=>v.toString(16).padStart(2,'0')).join('');
   const slot='firma:lote:'+digest;
   try{requestId=sessionStorage.getItem(slot)||requestId;sessionStorage.setItem(slot,requestId);}catch{}
   await prepare?.(requestId);
   const result=await mutate(action,{...fields,requestId});
   done(result.count,result.startsAt);
  }catch(e:any){
   try{const got=await requestJSON('/api/app?batch='+requestId);if(got.batch){done(got.batch.count,got.batch.startsAt);return;}}catch{}
   setError(e.message);
  }finally{sending.current=false;setBusy(false);}
 }
 return {busy,error,setError,submit};
}

export function BatchForm({state,mutate,initial,onClose,done}:{state:AppState;mutate:Mutate;initial:string[];onClose:()=>void;done:(count:number)=>void}){
 const [ids,select]=useState(initial),[account,setAccount]=useState(''),[date,setDate]=useState(()=>dateInput(Date.now()+5*60000,state.workspace.timezone)),[caption,setCaption]=useState(''),[loc,setLoc]=useState<any>({location:defaultLocation,locationMode:'caption',placeId:saoPauloPage}),[review,setReview]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const {busy,error,setError,submit}=useBatchSubmission(state,mutate,done);
 const acct=state.accounts.find(a=>a.id===account),videos=state.media.filter(m=>['video/mp4','video/quicktime'].includes(m.mime)),map=new Map(videos.map(m=>[m.id,m])),filtered=videos.filter(m=>m.name.toLowerCase().includes(search.trim().toLowerCase())),p=Math.min(page,Math.max(1,Math.ceil(filtered.length/30)));let start=0;try{start=localToEpoch(date,state.workspace.timezone);}catch{}
 const fields={accountId:account,mediaIds:ids,startsAt:start,caption,...loc,approved:true};
 const problem=!acct?'Selecione um perfil.':!acct.resolvedCoverId?'Cadastre a capa padrão desse perfil em Contas conectadas.':!ids.length||ids.length>100?'Escolha entre 1 e 100 vídeos.':!start||start<Date.now()+60000?'Escolha um início pelo menos um minuto à frente.':'';
 function reorder(i:number,by:number){const a=[...ids];[a[i],a[i+by]]=[a[i+by],a[i]];select(a);}

 return <Modal wide title={review?'Revisar lote de Reels':'Agendar Reels em lote'} onClose={()=>{if(!busy)onClose();}}><div className="modal-body"><p className="muted">Um perfil, uma capa e um horário por vídeo. O intervalo mínimo entre os envios é de um minuto.</p>{!review?<><div className="form-grid"><Field label="Perfil do Instagram"><select value={account} onChange={e=>{setAccount(e.target.value);setLoc({...loc,locationMode:state.accounts.find(a=>a.id===e.target.value)?.nativeLocation?'native':'caption'});}}><option value="">Escolha o perfil</option>{state.accounts.filter(a=>a.platform==='instagram'&&a.state==='connected').map(a=><option key={a.id} value={a.id}>@{a.username}</option>)}</select></Field><Field label={'Primeiro horário · '+state.workspace.timezone}><input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></Field></div>{acct&&<p className="small muted">Capa: {acct.resolvedCoverName??'nenhuma cadastrada'}</p>}<Field label="Legenda comum (opcional)"><textarea maxLength={2200} value={caption} onChange={e=>setCaption(e.target.value)}/></Field><LocationFields value={loc} native={!!acct?.nativeLocation} onChange={v=>setLoc({...loc,...v})}/><Field label={'Vídeos · '+ids.length+' selecionado(s)'}><input type="search" placeholder="Buscar na biblioteca" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></Field><div className="firma-list">{filtered.slice((p-1)*30,p*30).map(m=><label className="firma-entry" key={m.id}><input type="checkbox" checked={ids.includes(m.id)} onChange={e=>select(e.target.checked?[...ids,m.id]:ids.filter(x=>x!==m.id))}/><span>{m.name}</span></label>)}{!filtered.length&&<p className="muted">Nenhum MP4 ou MOV nesta biblioteca.</p>}</div><Pager page={p} setPage={setPage} count={filtered.length} limit={30}/></>:<><strong>@{acct?.username} · {ids.length} Reels</strong><p className="small muted">Capa: {acct?.resolvedCoverName} · {loc.locationMode==='none'?'Sem localização':loc.location||defaultLocation}</p><div className="firma-list batch-review">{ids.map((k,i)=><div className="firma-entry" key={k}><b>{i+1}</b><span>{map.get(k)?.name}<small>{formatDate(start+60000*i,state.workspace.timezone)}</small></span><button className="icon-button" aria-label={'Antecipar '+(i+1)} disabled={busy||!i} onClick={()=>reorder(i,-1)}><ArrowUp size={14}/></button><button className="icon-button" aria-label={'Adiar '+(i+1)} disabled={busy||i===ids.length-1} onClick={()=>reorder(i,1)}><ArrowDown size={14}/></button></div>)}</div><p className="muted small">Ao confirmar, você autoriza esses envios. Com o painel aberto, a fila acompanha os horários. Com o painel fechado, a verificação atual é horária. O Instagram pode atrasar um envio; o próximo não será antecipado.</p></>}{error&&<ActionError message={error}/>}</div><div className="modal-footer"><button className="button" disabled={busy} onClick={()=>review?setReview(false):onClose()}>Voltar</button><button className="button primary" disabled={busy} onClick={()=>{if(review){void submit('post.batch',fields);return;}if(problem){setError(problem);return;}setError('');setReview(true);}}>{busy?'Salvando…':review?'Confirmar e agendar '+ids.length+' Reel(s)':'Revisar horários'}</button></div></Modal>;
}

export function SharedReelForm({state,mutate,onClose,done}:{state:AppState;mutate:Mutate;onClose:()=>void;done:(count:number,startsAt?:number)=>void}){
 const profiles=state.accounts.filter(a=>a.platform==='instagram'&&a.state==='connected');
 const videos=state.media.filter(m=>['video/mp4','video/quicktime'].includes(m.mime));
 const covers=state.media.filter(usableCover);
 const [accountIds,setAccounts]=useState<string[]>([]),[mediaId,setVideo]=useState(''),[coverId,setCover]=useState('');
 const [caption,setCaption]=useState(''),[title,setTitle]=useState(''),[date,setDate]=useState(()=>dateInput(Date.now()+10*60000,state.workspace.timezone));
 const [review,setReview]=useState(false),[videoSearch,setVideoSearch]=useState(''),[coverSearch,setCoverSearch]=useState('');
 const [progress,setProgress]=useState('');
 const draftKey='firma:prisma-post:'+ (state.groupId??'geral');
 const {busy,error,setError,submit}=useBatchSubmission(state,mutate,(count,startsAt)=>{
  try{sessionStorage.removeItem(draftKey);}catch{}
  done(count,startsAt);
 });
 useEffect(()=>{
  try{
   const saved=JSON.parse(sessionStorage.getItem(draftKey)??'null');
   if(saved){setTitle(saved.title);setVideo(saved.mediaId);setCover(saved.coverId);setAccounts(saved.accountIds);setCaption(saved.caption);setDate(saved.date);}
  }catch{}
 },[draftKey]);
 const video=videos.find(v=>v.id===mediaId),cover=covers.find(c=>c.id===coverId);
 let startsAt=0;try{startsAt=localToEpoch(date,state.workspace.timezone);}catch{}
 const problem=accountIds.length<2||accountIds.length>100?'Selecione entre 2 e 100 perfis conectados.':
  accountIds.some(id=>!profiles.some(a=>a.id===id))?'Há um perfil indisponível. Revise a seleção.':
  !title.trim()||/[\/\\]/.test(title)?'Digite um título sem barras.':
  !video||!cover?'Escolha um vídeo MP4 ou MOV e uma capa JPG.':
  video.size>80*1024*1024||(video.duration??0)>180?'O Prisma aceita vídeos de até 80 MB e 3 minutos.':
  !startsAt?'Escolha a data e o horário de início.':'';
 function move(i:number,offset:number){
  const ordered=[...accountIds];
  [ordered[i],ordered[i+offset]]=[ordered[i+offset],ordered[i]];
  setAccounts(ordered);
 }
 return <Modal wide title={review?'Revisar sequência por perfil':'Mesmo Reel em várias contas'} onClose={()=>{if(!busy)onClose();}}>
  <div className="modal-body">
   <p className="muted">Selecione os perfis do Instagram. O Prisma cria uma edição leve de vídeo e áudio por perfil. A capa e a descrição são compartilhadas.</p>
   {!review?<><Field label="Título da publicação"><input maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></Field><div className="form-grid">
    <div><Field label="Buscar vídeo"><input type="search" value={videoSearch} onChange={e=>setVideoSearch(e.target.value)}/></Field>
    <Field label="Vídeo MP4 ou MOV"><select value={mediaId} onChange={e=>setVideo(e.target.value)}><option value="">Escolha um vídeo</option>{videos.filter(m=>m.id===mediaId||m.name.toLowerCase().includes(videoSearch.trim().toLowerCase())).map(m=><option key={m.id} value={m.id}>{m.name} · {m.folder}</option>)}</select></Field></div>
    <div><Field label="Buscar capa"><input type="search" value={coverSearch} onChange={e=>setCoverSearch(e.target.value)}/></Field>
    <Field label="Capa JPG de até 8 MB"><select value={coverId} onChange={e=>setCover(e.target.value)}><option value="">Escolha uma capa</option>{covers.filter(m=>m.id===coverId||m.name.toLowerCase().includes(coverSearch.trim().toLowerCase())).map(m=><option key={m.id} value={m.id}>{m.name} · {m.folder}</option>)}</select></Field></div>
   </div>
   <Field label="Descrição comum"><textarea maxLength={2200} value={caption} onChange={e=>setCaption(e.target.value)}/></Field>
   <Field label={'Primeiro horário · '+state.workspace.timezone}><input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></Field>
   <p><strong>Perfis selecionados ({accountIds.length})</strong></p>
   <div className="firma-list">{profiles.map(a=><label className="firma-entry" key={a.id}><input type="checkbox" checked={accountIds.includes(a.id)} onChange={e=>setAccounts(e.target.checked?[...accountIds,a.id]:accountIds.filter(id=>id!==a.id))}/><span>@{a.username}</span></label>)}
   {!profiles.length&&<p className="muted">Nenhum perfil do Instagram conectado nesta área.</p>}</div></>:<>
    <p><strong>{title.trim()}</strong> · {video?.name} · Capa {cover?.name}</p>
    <p className="muted small">Pasta na biblioteca: {sharedReelFolder(title.trim())}</p>
    {caption&&<p className="post-caption">{caption}</p>}
    <div className="firma-list batch-review">{accountIds.map((id,i)=><div className="firma-entry" key={id}>
     <b>{i+1}</b><span>@{profiles.find(a=>a.id===id)?.username??'Perfil indisponível'}<small>{formatDate(startsAt+SHARED_REEL_INTERVAL_MS*i,state.workspace.timezone)}</small></span>
     <button className="icon-button" aria-label={'Antecipar perfil '+(i+1)} disabled={busy||i===0} onClick={()=>move(i,-1)}><ArrowUp size={14}/></button>
     <button className="icon-button" aria-label={'Adiar perfil '+(i+1)} disabled={busy||i===accountIds.length-1} onClick={()=>move(i,1)}><ArrowDown size={14}/></button>
    </div>)}</div>
    <p className="muted small">Mantenha esta aba aberta durante a renderização. Se o primeiro horário passar, o lote começa no próximo horário disponível após a preparação. A fila aguarda pelo menos três minutos após cada confirmação do Instagram. Depois de agendado, com a aba fechada, a verificação automática é horária.</p>
   </>}
   {progress&&<p className="small" role="status" aria-live="polite">{progress}</p>}
   {error&&<ActionError message={error}/>}
  </div>
  <div className="modal-footer">
   <button className="button" disabled={busy} onClick={()=>{setError('');if(review)setReview(false);else onClose();}}>Voltar</button>
   <button className="button primary" disabled={busy} onClick={()=>{
    if(problem){setError(problem);return;}
    setError('');
    if(!review){setReview(true);return;}
    const fields={accountIds,mediaId,coverId,caption,title:title.trim(),startsAt,approved:true};
    try{sessionStorage.setItem(draftKey,JSON.stringify({...fields,date}));}catch{}
    void submit('post.sharedReelBatch',fields,async requestId=>{
     setProgress('Preparando o projeto Prisma…');
     const prepared=await requestJSON('/api/app',{method:'POST',body:JSON.stringify({action:'post.prepareSharedReelBatch',groupId:state.groupId,data:{...fields,requestId}})});
     if(prepared.count)return;
     const {renderSharedReelVersions}=await import('@/lib/prisma/prepare-shared-reel');
     await renderSharedReelVersions({projectId:prepared.projectId,group:state.groupId,source:video!,profiles:accountIds.map(id=>profiles.find(a=>a.id===id)!),progress:setProgress});
     setProgress('Versões salvas. Agendando os envios…');
    }).finally(()=>setProgress(''));
   }}>{busy?'Preparando lote…':review?'Preparar no Prisma e agendar '+accountIds.length+' Reels':'Revisar sequência'}</button>
  </div>
 </Modal>;
}
