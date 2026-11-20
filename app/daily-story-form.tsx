'use client';
import {ruleEditToken,ruleEditNotice} from '@/lib/rule-config';
import {connectedProfiles} from '@/lib/connections';
import {withoutRedProfiles,profileIsRed} from '@/lib/profile-availability';
import {ProfileUsername} from './profile-username';
import {useState} from 'react';
import type {AppState} from '@/lib/domain';
import {Modal,Field,Thumb,type Mutate} from './ui';
import AccountAvatar from './account-avatar';
export default function DailyStoryForm({state,mutate,onClose,onDraft,rule}:{state:AppState;mutate:Mutate;onClose:()=>void;onDraft:()=>void;rule?:any}){
 const [requestId]=useState(()=>crypto.randomUUID());
 const [name,setName]=useState(rule?.name??'Story diário'),[time,setTime]=useState(rule?.time??'12:00'),[startsOn,setStartsOn]=useState(()=>{const today=new Intl.DateTimeFormat('sv-SE',{timeZone:state.workspace.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());return rule?.starts_on>today?rule.starts_on:today;});
 const [mediaId,setMediaId]=useState(rule?.mediaIds?.[0]??''),[accountIds,setAccountIds]=useState<string[]>(rule?.accountIds??[]),[approved,setApproved]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const accounts=state.accounts.filter(a=>a.platform==='instagram'&&(a.state==='connected'||accountIds.includes(a.id)));
 const visible=accounts.filter(a=>(a.username+' '+a.displayName).toLowerCase().includes(query.toLowerCase().replace(/^@/,'')));
 const media=state.media.filter(m=>['image/jpeg','video/mp4','video/quicktime'].includes(m.mime));
 async function save(){setBusy(true);setError('');try{await mutate(rule?'rule.update':'rule.save',{id:rule?.id??requestId,expected:rule?ruleEditToken(rule):undefined,mode:'daily_story',name,time,startsOn,mediaIds:[mediaId],accountIds,approved});onClose();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <Modal title={rule?'Editar rotina de Stories':'Stories diários automáticos'} onClose={onClose}><div className="modal-body">
 {!rule&&<Field label="Tipo de rotina"><select value="daily_story" onChange={e=>{if(e.target.value==='draft')onDraft();}}><option value="daily_story">Repetir o mesmo Story todos os dias</option><option value="draft">Preparar rascunhos para revisão</option></select></Field>}
 {rule&&<div className="inline-note">{ruleEditNotice} Se o Story do dia já começou, as mudanças valem a partir do próximo dia.</div>}
 <div className="inline-note">A mesma mídia será publicada todos os dias, no horário e nos perfis escolhidos, até você pausar ou excluir esta rotina.</div>
 <Field label="Nome da rotina"><input maxLength={80} value={name} onChange={e=>{setName(e.target.value);setApproved(false);}}/></Field>
 <div className="form-row"><Field label={rule?'Aplicar a partir do dia':'Primeiro dia'}><input type="date" value={startsOn} onChange={e=>{setStartsOn(e.target.value);setApproved(false);}}/></Field><Field label={'Horário diário · '+state.workspace.timezone}><input type="time" value={time} onChange={e=>{setTime(e.target.value);setApproved(false);}}/></Field></div>
 <Field label="Mídia fixa do Story"><select value={mediaId} onChange={e=>{setMediaId(e.target.value);setApproved(false);}}><option value="">Selecione uma imagem ou vídeo</option>{media.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
 {mediaId&&<div className="daily-story-preview"><Thumb media={media.find(m=>m.id===mediaId)} controls/></div>}
 {!media.length&&<p className="muted small">Envie uma imagem JPEG ou um vídeo MP4/MOV pela Biblioteca antes de criar a rotina.</p>}
 <p className="muted small">O texto deve estar na própria imagem ou vídeo. Stories que exigem adesivos ou finalização manual no Instagram não são compatíveis com a repetição automática.</p>
 <div className="field"><span>Perfis Instagram · {accountIds.length} selecionado(s)</span><input type="search" aria-label="Buscar perfis da rotina" placeholder="Buscar @perfil" value={query} onChange={e=>setQuery(e.target.value)}/><div className="toolbar"><button type="button" className="text-button" disabled={busy||!connectedProfiles(accounts).length} onClick={()=>{setAccountIds(connectedProfiles(accounts).map(a=>a.id));setApproved(false);}}>Selecionar todos os conectados ({connectedProfiles(accounts).length})</button><button className="text-button" onClick={()=>{setAccountIds(accounts.filter(a=>a.state==='connected').map(a=>a.id));setApproved(false);}}>Selecionar todos ({accounts.length})</button><button className="text-button" onClick={()=>{setAccountIds(withoutRedProfiles(accounts).map(a=>a.id));setApproved(false);}}>Selecionar apenas disponíveis confirmados ({withoutRedProfiles(accounts).length})</button><button className="text-button" onClick={()=>{setAccountIds([]);setApproved(false);}}>Limpar seleção</button></div>
 <div className="daily-story-accounts">{visible.map(a=><label className="check" key={a.id}><input type="checkbox" checked={accountIds.includes(a.id)} onChange={e=>{setAccountIds(e.target.checked?[...accountIds,a.id]:accountIds.filter(x=>x!==a.id));setApproved(false);}}/><AccountAvatar account={a}/><ProfileUsername username={a.username}/>{a.state!=='connected'&&<span className="error">Reconexão necessária · remova da seleção ou reconecte</span>}</label>)}</div>{!accounts.length&&<small>Conecte pelo menos um perfil Instagram.</small>}</div>
 <p className="muted small">A fila verifica os envios a cada 60 minutos em segundo plano. O horário é o início da janela de envio; vários perfis podem concluir em momentos diferentes. Dias perdidos não são repostos em lote.</p>
 <label className="check daily-story-approval"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/><span>Revisei a mídia e os perfis. Autorizo publicar este mesmo Story diariamente, sem nova aprovação, até pausar a rotina.</span></label>
 {!state.scheduler.enabled&&<p className="error">Ative a fila automática em Configurações antes de criar esta rotina.</p>}{error&&<div className="error" role="alert">{error}</div>}
 </div><div className="modal-footer"><button className="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy||!approved||!mediaId||!accountIds.length||!state.scheduler.enabled} onClick={save}>{busy?'Salvando…':rule?'Salvar alterações':'Ativar Stories diários'}</button></div></Modal>;
}
