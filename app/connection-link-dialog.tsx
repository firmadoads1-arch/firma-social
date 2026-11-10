'use client';
import {useEffect,useRef,useState} from 'react';
import {Copy,Link2,RefreshCw,Share2,ShieldCheck,Smartphone,X} from 'lucide-react';
import {platformNames,type AppState,type Platform} from '@/lib/domain';
import {Field,Modal,requestJSON,formatDate} from './ui';

type Link={id:string;url:string;expiresAt:number;completedCount:number};
export default function ConnectionLinkDialog({platform,state,refresh,onClose,onConfigure,insights=false}:{platform:Platform;state:AppState;refresh:()=>Promise<AppState>;onClose:()=>void;onConfigure:(p:Platform)=>void;insights?:boolean}) {
  const [link,setLink]=useState<Link|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const input=useRef<HTMLInputElement>(null),latest=useRef({refresh});latest.current={refresh};
  const endpoint='/api/connection-links/'+platform;
  const configured=state.providers[platform].configured;
  const shareURL=link?link.url.replace('/connect#',insights?'/connect?insights=1#':'/connect#'):'';
  useEffect(()=>{let active=true,reading=false;const load=async(initial=false)=>{if(reading)return;reading=true;try{const result=await requestJSON(endpoint);if(active){setLink(result.link);setError('');if(!initial)await latest.current.refresh();}}catch(e:any){if(active)setError(e.message);}finally{reading=false;if(active)setBusy(false);}};void load(true);const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},5000);return()=>{active=false;clearInterval(timer);};},[endpoint]);
  async function create(){setBusy(true);setError('');setMessage('');try{const result=await requestJSON(endpoint,{method:'POST',body:'{}'});setLink(result.link);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  async function revoke(){if(!link)return;setBusy(true);setError('');try{await requestJSON(endpoint,{method:'DELETE',body:JSON.stringify({id:link.id})});setLink(null);setMessage('Link revogado. As contas já conectadas continuam no painel.');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  async function copy(){if(!link)return;try{await navigator.clipboard.writeText(shareURL);setMessage('Link copiado. Abra-o no navegador ou celular em que está a conta.');}catch{input.current?.focus();input.current?.select();setMessage('Selecione e copie o endereço acima.');}}
  async function share(){if(!link)return;if(!navigator.share){await copy();return;}try{await navigator.share({title:'Conectar '+platformNames[platform]+' ao Firma Social',url:shareURL});}catch(e:any){if(e.name!=='AbortError')setError('Não foi possível compartilhar. Use Copiar link.');}}
  const expired=!!link&&link.expiresAt<=Date.now();
  return <Modal title={'Conectar '+platformNames[platform]+' em outro dispositivo'} onClose={onClose}><div className="modal-body connection-link-body">
    <div className="remote-connect-intro"><Smartphone size={30}/><div><h3>Um link. Vários navegadores.</h3><p>Abra no celular, emulador ou outro navegador. Cada perfil autorizado será adicionado a <strong>{state.workspace.name}</strong>.</p></div></div>
    <ol className="connection-link-steps"><li>Copie o link e abra no dispositivo desejado.</li><li>Entre na conta e aceite a autorização oficial{insights?', incluindo a leitura de métricas':''}.</li><li>Confira o perfil neste painel, que atualiza automaticamente.</li></ol>
    {link&&!expired?<><Field label="Seu link de conexão" hint={'Reutilizável até '+formatDate(link.expiresAt,state.workspace.timezone,true)+'. Não precisa gerar um link para cada conta.'}><input ref={input} readOnly value={shareURL} onFocus={e=>e.target.select()}/></Field><div className="connection-link-actions"><button className="button primary" onClick={copy}><Copy size={16}/>Copiar link</button><button className="button" onClick={share}><Share2 size={16}/>Compartilhar</button></div><p className="link-progress" role="status"><RefreshCw size={15}/>{link.completedCount} autorização(ões) concluída(s) com este link</p><button className="text-button" disabled={busy} onClick={revoke}><X size={14}/>Revogar link</button></>:configured?<button className="button primary full" disabled={busy} onClick={create}><Link2 size={16}/>{busy?'Carregando…':'Gerar link válido por 24 horas'}</button>:<div className="inline-note">Configure o aplicativo para gerar um link.<button className="button" onClick={()=>onConfigure(platform)}>Configurar {platformNames[platform]}</button></div>}
    <div className="connections-help"><ShieldCheck size={19}/><p>Compartilhe somente com quem pode vincular perfis a este workspace. Não é necessário entrar no Firma Social no outro dispositivo. O link não dá acesso ao painel nem às contas existentes.</p></div>
    {message&&<p className="connection-banner" role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}
  </div><div className="modal-footer"><button className="button" onClick={onClose}>Voltar ao painel</button></div></Modal>;
}
