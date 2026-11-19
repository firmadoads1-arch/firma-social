'use client';
import {ProfileUsername} from './profile-username';
import {useState,useEffect,useRef} from 'react';
import {Plus,RefreshCw,Settings,ShieldCheck,Search,X,Smartphone,FolderOpen} from 'lucide-react';
import {platforms,platformNames,type AppState,type Platform,type Account} from '@/lib/domain';
import {accountLabel} from '@/lib/connections';
import AccountAvatar from './account-avatar';
import {Network,requestJSON} from './ui';
import {profileIsRed,availabilityMessages} from '@/lib/profile-availability';

export default function Accounts({state,onPreferences,connect,connecting,onConfigure,onDisconnect,onRefresh,onConnectionLink,onVerification}:{onVerification?:(id:string,data:Partial<Account>)=>void;onPreferences:(a:Account)=>void;onConnectionLink:(p:Platform)=>void;state:AppState;connect:(p:Platform)=>void;connecting:Platform|null;onConfigure:(p:Platform)=>void;onDisconnect:(a:Account)=>void;onRefresh:(quiet?:boolean,accountId?:string)=>Promise<void>}) {
  const [verifying,setVerifying]=useState(false),[verificationProgress,setVerificationProgress]=useState(''),[verificationError,setVerificationError]=useState('');
  const verificationLock=useRef(false),verificationStop=useRef(false);
  useEffect(()=>()=>{verificationStop.current=true;},[]);
  async function verify(ids?:string[]){
   if(verificationLock.current)return;verificationLock.current=true;verificationStop.current=false;setVerifying(true);setVerificationError('');
   let done=0,unread=0,red=0,available=0,failed=0,cursor=0;const reasons:Record<string,number>={};
   setVerificationProgress('Preparando verificação de TODAS as contas…');
   try{
    const targets=ids??(await requestJSON('/api/accounts/verify')).accounts.map((a:{id:string})=>a.id);
    setVerificationProgress(`Verificando ${targets.length} conta(s) automaticamente… 0%`);
    const worker=async()=>{while(!verificationStop.current){const accountId=targets[cursor++];if(!accountId)break;
     try{const result=await requestJSON('/api/accounts/verify',{method:'POST',body:JSON.stringify({accountId})});onVerification?.(accountId,result);if(result.availabilityResult==='unknown'){unread++;reasons[result.availabilityReason]=(reasons[result.availabilityReason]??0)+1;}else if(['unavailable','needs_review'].includes(result.availabilityResult))red++;else available++;}
     catch(e:any){failed++;setVerificationError(e.message??'Falha na verificação.');}
     done++;setVerificationProgress(`Verificação de TODAS: ${done}/${targets.length} · ${Math.round(done/targets.length*100)}% · ${available} no ar · ${red} precisam de verificação · ${unread+failed} sem confirmação`);
    }};
    await Promise.all(Array.from({length:Math.min(3,targets.length)},worker));
    if(unread){const causes=Object.keys(reasons).map(key=>key==='instagram_access_redirect'?'Instagram enviou uma tela de acesso em vez da página pública':key==='redirect_not_profile'||key.includes('redirect')?'Instagram redirecionou a consulta para outra página':key==='rate_limited'?'Instagram limitou as consultas':key==='network_or_timeout'?'falha de rede ou tempo esgotado':'página pública não retornada').filter((v,i,a)=>a.indexOf(v)===i).join('; ');setVerificationError(`Não foi possível ler ${unread} página(s) pública(s) (${causes}). Esses perfis não foram marcados como disponíveis e não entram na seleção de confirmados.`);}
   }catch(e:any){setVerificationError(e.message??'Não foi possível iniciar a verificação de todas as contas.');}
   finally{verificationLock.current=false;setVerifying(false);}
  }
  const [query,setQuery]=useState('');const [refreshing,setRefreshing]=useState(false);
  const [photoFailures,setPhotoFailures]=useState<string[]>([]),[retrying,setRetrying]=useState<string|null>(null);
  async function retryPhoto(id:string){setRetrying(id);try{await onRefresh(false,id);setPhotoFailures(prev=>prev.filter(x=>x!==id));}finally{setRetrying(null);}}
  const started=useRef(false),photoRecovery=useRef(new Set<string>());
  function recoverPhoto(account:Account){setPhotoFailures(prev=>prev.includes(account.id)?prev:[...prev,account.id]);if(account.state!=='connected'||account.profileSyncStatus==='authorization_required'||photoRecovery.current.has(account.id))return;photoRecovery.current.add(account.id);void onRefresh(true,account.id).catch(()=>{});}
  async function sync(quiet=false){setRefreshing(true);try{await onRefresh(quiet);}finally{setRefreshing(false);}}
  useEffect(()=>{if(started.current)return;started.current=true;void sync(true).catch(()=>{});const timer=setInterval(()=>{if(document.visibilityState==='visible')void sync(true).catch(()=>{});},60000);return()=>clearInterval(timer);},[]);
  const disconnected=(a:Account)=>a.state==='disconnected';
  const matches=(a:Account)=>(a.username+' '+a.displayName).toLowerCase().includes(query.trim().replace(/^@/,'').toLowerCase());
  const connected=state.accounts.filter(a=>a.state==='connected');
  const offline=state.accounts.filter(disconnected).filter(matches);
  const renderAccount=(account:Account)=><div className="connected-account" key={account.id}>
          <AccountAvatar account={account} onUnavailable={()=>recoverPhoto(account)}/><div><strong title={accountLabel(account)}>{account.displayName?.trim()?account.displayName:' '}</strong><small className="account-username"><ProfileUsername username={account.username} platform={account.platform}/></small>{account.platform==='instagram'&&<p className="account-biography" aria-label={'Bio de @'+account.username}>{account.biography===null||account.biography===undefined?'Bio ainda não sincronizada.':account.biography.trim()?account.biography:'Sem bio no Instagram.'}</p>}<small>{account.profileSyncStatus==='authorization_required'?'Reconexão necessária':account.state==='connected'?'Conectada':account.state==='expired'?'Autorização vencida':'Desconectada'}</small>{account.platform==='instagram'&&<div className="profile-photo-actions"><button className="text-button" disabled={verifying} onClick={()=>void verify([account.id])}>Verificação</button><small>{account.availabilityAttemptAt?((account.availabilityResult==='unknown'?'Página pública não pôde ser lida. ':availabilityMessages[account.availabilityResult??'']??'')+(profileIsRed(account)&&account.availabilityResult==='unknown'?'Mantido o aviso anterior.':'')):'Página de Reels ainda não verificada.'}</small>{account.profileSyncStatus==='authorization_required'?<button className="text-button photo-warning" disabled={!!connecting} onClick={()=>connect('instagram')}>Reconectar para atualizar foto</button>:<><button className="text-button" disabled={retrying===account.id||refreshing} onClick={()=>void retryPhoto(account.id).catch(()=>{})}>{retrying===account.id?'Atualizando perfil…':'Atualizar perfil'}</button>{account.profileSyncStatus==='permission_required'&&<small>O Instagram recusou a consulta do perfil. Confira as permissões do aplicativo.</small>}{(photoFailures.includes(account.id)||['temporary','unavailable','no_photo'].includes(account.profileSyncStatus??''))&&<small>{account.profileSyncStatus==='no_photo'?'Instagram não retornou uma foto.':'Foto indisponível na última tentativa.'}</small>}</>}</div>}</div>
          <button className="icon-button" title="Grupo e capa do perfil" aria-label={'Preferências de '+accountLabel(account)} onClick={()=>onPreferences(account)}><Settings size={15}/></button>{account.state==='connected'?<button className="icon-button" aria-label={'Desconectar '+accountLabel(account)} onClick={()=>onDisconnect(account)}><X size={16}/></button>:<button className="text-button" disabled={!!connecting} onClick={()=>connect(account.platform)}>Reconectar</button>}
        </div>;
  return <>
    <section className="connections-intro panel"><div><span className="eyebrow">TODOS OS PERFIS NO SEU WORKSPACE</span><h3>Uma gestão. Várias contas.</h3><p>Conecte quantos perfis você administra e escolha os destinos em cada conteúdo. A autorização de um Instagram permite ao Firma Social gerenciá-lo; ela não cria um usuário para esse perfil.</p></div><div className="connections-total"><strong>{connected.length}</strong><span>perfil{connected.length===1?'':'s'} conectado{connected.length===1?'':'s'}</span></div></section>
    <div className="toolbar"><button className="button" disabled={verifying} onClick={()=>void verify()}>{verifying?'Verificando TODAS…':'Verificar TODAS as contas'}</button>{verifying&&<button className="text-button" onClick={()=>{verificationStop.current=true;}}>Parar após os perfis em consulta</button>}<label className="search-box"><Search size={16}/><input aria-label="Buscar perfil conectado" placeholder="Buscar nome ou @perfil…" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="button" disabled={refreshing} onClick={()=>void sync().catch(()=>{})}><RefreshCw size={16} className={refreshing?'spin':''}/>{refreshing?'Sincronizando…':'Sincronizar perfis'}</button></div>
    {verificationProgress&&<p className="small" role="status" aria-live="polite">{verificationProgress}</p>}{verificationError&&<p className="error" role="alert">{verificationError}</p>}
    <p className="account-empty">Reels é consultado primeiro. Se falhar, a página principal é consultada também. Vermelho só aparece quando ambas exibem indisponibilidade. Falhas de consulta aparecem como ? e não classificam o perfil como fora do ar.</p>
    <p className="account-empty">{state.groupId?'Você está vendo apenas este grupo. Se faltar um perfil, selecione Geral no menu.':'Todos os grupos estão incluídos. Fotos e nomes são atualizados pelo Instagram. Use Sincronizar perfis para consultar novamente.'}</p><div className="integration-grid">{platforms.map(platform=>{
      const all=state.accounts.filter(a=>a.platform===platform);
      const visible=all.filter(a=>!disconnected(a)).filter(matches).sort((a,b)=>Number(b.profileSyncStatus==='authorization_required')-Number(a.profileSyncStatus==='authorization_required'));
      return <section className="panel integration-card" key={platform}>
        <div className="integration-top"><div className={'integration-logo '+platform}><Network platform={platform}/></div><span className="counter">{all.filter(a=>a.state==='connected').length} conectada(s)</span></div>
        <h3>{platformNames[platform]}</h3><p>{platform==='instagram'?'Perfis profissionais, cada um com sua própria autorização.':platform==='tiktok'?'Seus perfis para vídeos na caixa de entrada ou publicação direta.':'Seus canais, com controle de visibilidade por conteúdo.'}</p>
        <div className="connected-list">{visible.map(renderAccount)}{!visible.length&&<p className="account-empty">{query?'Nenhum perfil corresponde à busca.':'Nenhum perfil conectado ainda.'}</p>}</div>
        <div className="integration-actions"><button className="button primary full" disabled={!!connecting} onClick={()=>connect(platform)}>{connecting===platform?<RefreshCw size={16} className="spin"/>:<Plus size={16}/>} {connecting===platform?'Aguardando autorização…':all.length?'Conectar outra conta':'Conectar conta'}</button><button className="button full" onClick={()=>onConnectionLink(platform)}><Smartphone size={16}/>Conectar em outro dispositivo</button><button className="text-button" onClick={()=>onConfigure(platform)}><Settings size={14}/>{state.providers[platform].configured?'Aplicativo configurado · ajustes':'Configurar aplicativo'}</button></div>
      </section>;
    })}</div>
    <div className="connections-help"><ShieldCheck size={20}/><p>Mantenha seu painel aberto aqui e conecte os perfis onde preferir. Use Conectar em outro dispositivo para abrir um link no celular ou em outro navegador; todas as autorizações chegam a este workspace.</p></div>
    <details className="panel disconnected-folder" open={query.trim()?true:undefined}>
      <summary><FolderOpen size={20}/><strong>Perfis desconectados</strong><span className="counter">{offline.length}</span></summary>
      <p className="account-empty">Apenas perfis que você desconectou manualmente. Avisos de autorização não movem perfis para esta pasta. Ao reconectar, voltam automaticamente para a lista acima.</p>
      <div className="connected-list">{offline.map(renderAccount)}{!offline.length&&<p className="account-empty">{query?'Nenhum perfil desconectado corresponde à busca.':'Nenhum perfil desconectado.'}</p>}</div>
    </details>
  </>;
}
