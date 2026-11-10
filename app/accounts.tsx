'use client';
import {useState} from 'react';
import {Plus,RefreshCw,Settings,ShieldCheck,Search,X,Smartphone} from 'lucide-react';
import {platforms,platformNames,type AppState,type Platform,type Account} from '@/lib/domain';
import {accountLabel} from '@/lib/connections';
import {Network} from './ui';

export default function Accounts({state,onPreferences,connect,connecting,onConfigure,onDisconnect,onRefresh,onConnectionLink}:{onPreferences:(a:Account)=>void;onConnectionLink:(p:Platform)=>void;state:AppState;connect:(p:Platform)=>void;connecting:Platform|null;onConfigure:(p:Platform)=>void;onDisconnect:(a:Account)=>void;onRefresh:()=>Promise<void>}) {
  const [query,setQuery]=useState('');const [refreshing,setRefreshing]=useState(false);
  const connected=state.accounts.filter(a=>a.state==='connected');
  return <>
    <section className="connections-intro panel"><div><span className="eyebrow">TODOS OS PERFIS NO SEU WORKSPACE</span><h3>Uma gestão. Várias contas.</h3><p>Conecte quantos perfis você administra e escolha os destinos em cada conteúdo. A autorização de um Instagram permite ao Firma Social gerenciá-lo; ela não cria um usuário para esse perfil.</p></div><div className="connections-total"><strong>{connected.length}</strong><span>perfil{connected.length===1?'':'s'} conectado{connected.length===1?'':'s'}</span></div></section>
    <div className="toolbar"><label className="search-box"><Search size={16}/><input aria-label="Buscar perfil conectado" placeholder="Buscar nome ou @perfil…" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="button" disabled={refreshing} onClick={async()=>{setRefreshing(true);try{await onRefresh();}finally{setRefreshing(false);}}}><RefreshCw size={16} className={refreshing?'spin':''}/>Sincronizar perfis</button></div>
    <p className="account-empty">{state.groupId?'Você está vendo apenas este grupo. Se faltar um perfil, selecione Geral no menu.':'Todos os grupos estão incluídos. Sincronizar perfis consulta os usernames atuais no Instagram e preserva os vínculos.'}</p><div className="integration-grid">{platforms.map(platform=>{
      const all=state.accounts.filter(a=>a.platform===platform);
      const visible=all.filter(a=>(a.username+' '+a.displayName).toLowerCase().includes(query.trim().replace(/^@/,'').toLowerCase()));
      return <section className="panel integration-card" key={platform}>
        <div className="integration-top"><div className={'integration-logo '+platform}><Network platform={platform}/></div><span className="counter">{all.filter(a=>a.state==='connected').length} conectada(s)</span></div>
        <h3>{platformNames[platform]}</h3><p>{platform==='instagram'?'Perfis profissionais, cada um com sua própria autorização.':platform==='tiktok'?'Seus perfis para vídeos na caixa de entrada ou publicação direta.':'Seus canais, com controle de visibilidade por conteúdo.'}</p>
        <div className="connected-list">{visible.map(account=><div className="connected-account" key={account.id}>
          <span className="avatar">{(account.displayName||account.username).slice(0,1).toUpperCase()}</span><div><strong title={accountLabel(account)}>{accountLabel(account)}</strong><small>{account.state==='connected'?'Conectada':account.state==='expired'?'Autorização vencida':'Desconectada'}</small></div>
          <button className="icon-button" title="Grupo e capa do perfil" aria-label={'Preferências de '+accountLabel(account)} onClick={()=>onPreferences(account)}><Settings size={15}/></button>{account.state==='connected'?<button className="icon-button" aria-label={'Desconectar '+accountLabel(account)} onClick={()=>onDisconnect(account)}><X size={16}/></button>:<button className="text-button" disabled={!!connecting} onClick={()=>connect(platform)}>Reconectar</button>}
        </div>)}{!visible.length&&<p className="account-empty">{query?'Nenhum perfil corresponde à busca.':'Nenhum perfil conectado ainda.'}</p>}</div>
        <div className="integration-actions"><button className="button primary full" disabled={!!connecting} onClick={()=>connect(platform)}>{connecting===platform?<RefreshCw size={16} className="spin"/>:<Plus size={16}/>} {connecting===platform?'Aguardando autorização…':all.length?'Conectar outra conta':'Conectar conta'}</button><button className="button full" onClick={()=>onConnectionLink(platform)}><Smartphone size={16}/>Conectar em outro dispositivo</button><button className="text-button" onClick={()=>onConfigure(platform)}><Settings size={14}/>{state.providers[platform].configured?'Aplicativo configurado · ajustes':'Configurar aplicativo'}</button></div>
      </section>;
    })}</div>
    <div className="connections-help"><ShieldCheck size={20}/><p>Mantenha seu painel aberto aqui e conecte os perfis onde preferir. Use Conectar em outro dispositivo para abrir um link no celular ou em outro navegador; todas as autorizações chegam a este workspace.</p></div>
  </>;
}
