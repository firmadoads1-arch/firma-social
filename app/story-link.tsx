'use client';
import {useEffect,useRef,useState} from 'react';
import {Check,Copy,Download,ExternalLink,Link2,Smartphone} from 'lucide-react';
import type {AppState,Post} from '@/lib/domain';
import {accountLabel} from '@/lib/connections';
import {storyLinkURL,type StoryLink} from '@/lib/story-links';
import {Badge,Field,Modal,Thumb,formatDate,type Mutate} from './ui';

export function StoryLinkFields({value,onChange,disabled}:{value:StoryLink|null;onChange:(v:StoryLink|null)=>void;disabled:boolean}){
 return <section className="options-panel story-link-options">
  <h4><Link2 size={17}/> Link do Story</h4>
  <label className="check"><input type="checkbox" checked={!!value} disabled={disabled} onChange={e=>onChange(e.target.checked?{url:'',label:''}:null)}/>Quero adicionar um link clicável</label>
  {value&&<>
   <Field label="Endereço do link"><input type="url" placeholder="https://seusite.com/pagina" value={value.url} maxLength={2048} disabled={disabled} onChange={e=>onChange({...value,url:e.target.value})}/></Field>
   <Field label="Texto do adesivo (opcional)"><input placeholder="Saiba mais" value={value.label} maxLength={60} disabled={disabled} onChange={e=>onChange({...value,label:e.target.value})}/></Field>
   <div className="inline-note"><Smartphone size={19}/><span><strong>Finalização no Instagram</strong><br/>O Firma guarda a mídia, o link e o horário. Você copia o link, baixa a mídia e adiciona o adesivo Link no Instagram antes de publicar. Este Story não será publicado automaticamente.</span></div>
  </>}
 </section>;
}

export function StoryLinkPreview({link}:{link:StoryLink}){
 return <div className="story-link-preview"><span><Link2 size={17}/>{link.label||'Saiba mais'}</span><small>Guia do adesivo · adicionar no Instagram</small></div>;
}

export default function StoryLinkHandoff({post,state,mutate,onClose,onEdit,onDuplicate,onCancel,onRefresh}:{post:Post;state:AppState;mutate:Mutate;onClose:()=>void;onEdit:()=>void;onDuplicate:()=>void;onCancel:()=>void;onRefresh:()=>Promise<unknown>}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState<string|null>(null);
 const input=useRef<HTMLInputElement>(null);
 const link=post.options.instagramStoryLink as StoryLink;
 const url=storyLinkURL(link?.url);
 const place=post.options.locationMode==='sticker'?(post.options.location?.trim()||'São Paulo, SP'):null;
 const media=[...state.media,...(state.referenceMedia??[])].find(m=>m.id===post.mediaIds[0]);
 const deliveries=state.deliveries.filter(d=>d.postId===post.id);
 const completed=deliveries.filter(d=>d.status==='manual_published').length;
 useEffect(()=>{setConfirm(null);},[post.version]);
 async function copy(){
  setError('');try{if(!url)throw Error('O link salvo é inválido. Edite o Story antes de continuar.');await navigator.clipboard.writeText(url);setNotice('Link copiado. Cole no adesivo Link do Instagram.');}
  catch{input.current?.focus();input.current?.select();setNotice('Selecione e copie o endereço no campo acima.');}
 }
 async function record(accountId:string,published:boolean){
  setBusy(true);setError('');setNotice('');try{await mutate('post.manualStory',{id:post.id,accountId,version:post.version,published});setConfirm(null);setNotice(published?'Publicação manual registrada por você.':'Registro desfeito. A publicação no Instagram não foi alterada.');}
  catch(e:any){setError(e.message);await onRefresh().catch(()=>{});}finally{setBusy(false);}
 }
 return <Modal title="Finalizar Story no Instagram" onClose={()=>{if(!busy)onClose();}}>
  <div className="modal-body story-handoff">
   <div className="story-handoff-heading"><div><h3>{post.title}</h3><p>{formatDate(post.scheduledAt,state.workspace.timezone,true)} · {state.workspace.timezone}</p></div><Badge status={post.status}/></div>
   {media&&<div className="story-handoff-media"><Thumb media={media} controls/>{link&&<StoryLinkPreview link={link}/>}</div>}
   <div className="inline-note"><Smartphone size={19}/><span>Os adesivos precisam ser adicionados no Instagram. Baixar, copiar ou abrir o aplicativo não publica este Story. A mídia e o rascunho não são enviados ao Instagram por esta tela.</span></div>
   {post.status==='manual_pending'&&<p className="story-timing">{post.scheduledAt&&post.scheduledAt<=Date.now()?'O horário planejado chegou. Finalize a publicação em cada perfil abaixo.':'Preparado para o horário acima. A publicação depende da sua ação no Instagram.'}</p>}
   {place&&<Field label="Local para buscar no adesivo Localização"><input readOnly value={place} onFocus={e=>e.target.select()}/></Field>}
   {link&&<Field label="Link para colar no adesivo"><input ref={input} readOnly value={link?.url??''} onFocus={e=>e.target.select()}/></Field>}
   {link?.label&&<Field label="Texto sugerido para o adesivo"><input readOnly value={link.label} onFocus={e=>e.target.select()}/></Field>}
   <div className="story-handoff-actions">{link&&<button className="button primary" disabled={!url} onClick={copy}><Copy size={16}/>Copiar link</button>}{media&&<a className="button" href={'/api/media/'+media.id+'?download=1'} download><Download size={16}/>Baixar mídia</a>}<a className="button" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Abrir Instagram</a></div>
   {!media&&<p className="error">A mídia não está disponível nesta tela. Atualize o painel ou confira a biblioteca antes de publicar.</p>}
   <ol className="story-handoff-steps"><li>No Instagram, confira o perfil e crie um Story com a mídia baixada.</li>{link&&<li>Abra Figurinhas → Link e cole o endereço. Personalize o texto, se desejar.</li>}{place&&<li>Abra Figurinhas → Localização e escolha {place}.</li>}<li>Publique no Instagram. Depois, registre a conclusão no perfil correspondente abaixo.</li></ol>
   <div className="story-handoff-progress"><strong>{completed} de {post.accountIds.length} perfis com publicação informada</strong><small>Controle manual. O Firma não confirma esta publicação pela rede.</small></div>
   {post.accountIds.map(id=>{const a=state.accounts.find(a=>a.id===id),d=deliveries.find(d=>d.accountId===id),done=d?.status==='manual_published';return <div className="story-profile" key={id}><div className="story-profile-top"><div><strong>{a?accountLabel(a):'Perfil indisponível'}</strong><small>{done?'Registrado por você em '+formatDate(d.updatedAt,state.workspace.timezone):'Aguardando sua publicação no Instagram'}</small></div>{done?<Check size={19}/>:<Smartphone size={19}/>}</div>{confirm===id?<div className="story-confirm"><p>Você já adicionou o adesivo Link e publicou neste perfil?</p><button className="button primary small" disabled={busy} onClick={()=>record(id,true)}>Sim, registrar publicação</button><button className="button small" disabled={busy} onClick={()=>setConfirm(null)}>Voltar</button></div>:<button className="text-button" disabled={busy||!d} onClick={()=>done?record(id,false):setConfirm(id)}>{done?'Desfazer registro':'Já publiquei neste perfil'}</button>}</div>;})}
   {notice&&<p className="story-handoff-notice" role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
  </div>
  <div className="modal-footer">{completed===0&&post.status==='manual_pending'&&<><button className="text-button" disabled={busy} onClick={onCancel}>Cancelar planejamento</button><button className="button" disabled={busy} onClick={onEdit}>Editar Story</button></>}<button className="button" disabled={busy} onClick={onDuplicate}>Duplicar</button><button className="button primary" disabled={busy} onClick={onClose}>Fechar</button></div>
 </Modal>;
}
