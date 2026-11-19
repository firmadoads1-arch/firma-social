'use client';
import type {AppState} from '@/lib/domain';
export default function PublicationProgress({state,job,onClose}:{state:AppState;job:{id:string;batch?:boolean};onClose?:()=>void}){
 const posts=state.posts.filter(p=>job.batch?p.batchId===job.id:p.id===job.id);
 const ids=new Set(posts.map(p=>p.id));const deliveries=state.deliveries.filter(d=>ids.has(d.postId));
 const expected=posts.reduce((sum,p)=>sum+p.accountIds.length,0);
 const published=deliveries.filter(d=>d.status==='published').length;
 const attention=deliveries.filter(d=>['failed','uncertain','inbox','cancelled'].includes(d.status)).length;
 const waiting=deliveries.filter(d=>['pending','processing','working'].includes(d.status)).length;
 const complete=expected>0&&published===expected;
 const settled=expected>0&&deliveries.length===expected&&waiting===0;
 const percent=complete?100:expected?Math.min(99,Math.floor(65+35*published/expected)):65;
 return <section className="panel" role="status" aria-live="polite" style={{marginBottom:20}}><div className="panel-title"><h3>{complete?'Publicação concluída':settled?'Envio encerrado com pendências':'Acompanhando publicações'}</h3><strong>{percent}%</strong>{onClose&&<button className="text-button" onClick={onClose}>Ocultar acompanhamento</button>}</div><progress style={{width:'100%'}} max={100} value={percent}/><p>{published}/{expected||'…'} perfis com publicação confirmada · {waiting} aguardando · {attention} precisam de atenção</p>{!complete&&attention>0&&<p>{settled?'Todas as entregas foram verificadas. Há perfis que precisam de atenção.':'Os outros perfis continuam.'} Confira os erros abaixo ou em Atividade; resultados incertos não são reenviados automaticamente. O progresso só chega a 100% quando todas as publicações forem confirmadas.</p>}{!settled&&<small>Mantenha o painel aberto para acompanhar a fila. Cada perfil tem seu próprio resultado.</small>}</section>;
}
