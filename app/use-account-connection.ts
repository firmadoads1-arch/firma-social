'use client';
import {useEffect,useRef,useState} from 'react';
import {platforms,type AppState,type Platform} from '@/lib/domain';
import {accountLabel,connectionError,type ConnectionNotice,type ConnectionResult} from '@/lib/connections';
import {requestJSON} from './ui';

export function useAccountConnection({state,refresh,onConfigure}:{state:AppState;refresh:()=>Promise<AppState>;onConfigure:(p:Platform)=>void}) {
  const [connecting,setConnecting] = useState<Platform|null>(null);
  const [notice,setNotice] = useState<ConnectionNotice|null>(null);
  const latest = useRef({state,refresh,onConfigure}); latest.current = {state,refresh,onConfigure};
  const attempt = useRef<{platform:Platform;popup:Window;before:Set<string>;started:number;reading:boolean;receiving:boolean}|null>(null);
  function stop() {attempt.current=null;setConnecting(null);}
  async function receive(data: ConnectionResult) {
    const active=attempt.current;
    if(!active || data?.type!=='firma:connection' || data.platform!==active.platform || active.receiving) return;
    active.receiving=true;
    if(data.error){setNotice({message:connectionError(data.error),error:true});stop();return;}
    try {
      const next=await latest.current.refresh();
      const account=next.accounts.find(a=>a.id===data.accountId&&a.platform===data.platform&&a.state==='connected');
      if(!account) throw new Error('A conta ainda não apareceu no workspace. Clique em Atualizar contas para conferir.');
      setNotice({message:`${accountLabel(account)} conectado. Você já pode selecioná-lo nos conteúdos.`,error:false});stop();
    } catch(e:any) {setNotice({message:e.message,error:true});active.receiving=false;}
  }
  useEffect(()=>{
    const onMessage=(event:MessageEvent)=>{if(event.origin===location.origin && event.source===attempt.current?.popup)void receive(event.data);};
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('firma-connections'):null;
    if(channel)channel.onmessage=event=>void receive(event.data);
    const sync=async()=>{
      const active=attempt.current;if(!active||active.reading||active.receiving)return;
      if(Date.now()-active.started>600000){setNotice({message:'A conexão ainda não foi confirmada. Confira a janela da rede social ou inicie uma nova tentativa.',error:true});stop();return;}
      active.reading=true;
      try {
        const next=await latest.current.refresh();
        if(attempt.current!==active)return;
        const added=next.accounts.find(a=>a.platform===active.platform&&a.state==='connected'&&!active.before.has(a.id));
        if(added){setNotice({message:`${accountLabel(added)} conectado. Selecione o perfil no seu conteúdo.`,error:false});stop();}
      } catch { /* The regular workspace banner handles read failures. */ }
      finally {active.reading=false;}
    };
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void sync();},4000);
    window.addEventListener('message',onMessage);window.addEventListener('focus',sync);
    return()=>{clearInterval(timer);channel?.close();window.removeEventListener('message',onMessage);window.removeEventListener('focus',sync);};
  },[]);
  async function connect(platform:Platform,insights=false) {
    if(!platforms.includes(platform)||attempt.current)return;
    if(!latest.current.state.providers[platform].configured){latest.current.onConfigure(platform);return;}
    // Open synchronously to keep the editor intact and avoid popup blocking.
    const popup=window.open('about:blank','firma-connect-'+Date.now(),'popup,width=620,height=780');
    if(!popup){setNotice({message:'Permita a abertura da janela de conexão neste site e clique novamente em Conectar conta. Seu conteúdo continua no editor.',error:true});return;}
    attempt.current={platform,popup,before:new Set(latest.current.state.accounts.filter(a=>a.state==='connected').map(a=>a.id)),started:Date.now(),reading:false,receiving:false};
    setConnecting(platform);setNotice({message:'Conclua a autorização na janela da rede social. O Firma Social atualizará os perfis automaticamente.',error:false});
    try {
      const {url}=await requestJSON('/api/oauth/'+platform+'/start'+(insights?'?insights=1':''),{method:'POST',body:'{}'});
      popup.location.href=url;
    } catch(e:any){popup.close();stop();setNotice({message:e.message,error:true});}
  }
  return {connect,connecting,notice,setNotice};
}
