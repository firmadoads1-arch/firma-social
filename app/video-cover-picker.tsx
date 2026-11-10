'use client';
import {useEffect,useRef,useState} from 'react';
import {loadPreviewVideo} from '@/lib/video-preview';
import type {Media} from '@/lib/domain';

// The browser decodes the private, same-origin video. Only the selected JPEG
// is uploaded; no video rendering or frame extraction runs on the server.
export default function VideoCoverPicker({media,disabled,onPick,onClose,onPreview}:{media:Media;disabled:boolean;onPick:(file:File)=>Promise<boolean>;onClose:()=>void;onPreview?:(image:string)=>void}){
 const video=useRef<HTMLVideoElement>(null),previewAt=useRef(-1);
 function showFrame(){const v=video.current;if(!onPreview||!v||v.seeking||v.readyState<2||!v.videoWidth)return;const at=Math.round(v.currentTime*100);if(previewAt.current===at)return;try{const c=document.createElement('canvas'),scale=Math.min(1,310/v.videoWidth,550/v.videoHeight);c.width=Math.max(1,Math.round(v.videoWidth*scale));c.height=Math.max(1,Math.round(v.videoHeight*scale));const ctx=c.getContext('2d');if(ctx){ctx.drawImage(v,0,0,c.width,c.height);onPreview(c.toDataURL('image/jpeg',.8));previewAt.current=at;}}catch{}}

 const [duration,setDuration]=useState(0),[time,setTime]=useState(0),[ready,setReady]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('');
 const [source,setSource]=useState(''),[progress,setProgress]=useState(0),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 const seekTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{const controller=new AbortController();let alive=true,url='';const timer=setTimeout(()=>controller.abort(),60000);setReady(false);setDuration(0);setTime(0);previewAt.current=-1;setError('');setLoading(true);setSource('');setProgress(0);
  loadPreviewVideo(media.id,controller.signal,p=>{if(alive)setProgress(p);}).then(blob=>{if(alive){url=URL.createObjectURL(blob);setSource(url);setLoading(false);}}).catch(()=>{if(alive){setLoading(false);setError('O carregamento foi interrompido ou demorou demais. Clique em Tentar novamente.');}}).finally(()=>clearTimeout(timer));
  const player=video.current;return()=>{alive=false;clearTimeout(timer);controller.abort();if(seekTimer.current)clearTimeout(seekTimer.current);player?.pause();player?.removeAttribute('src');player?.load();if(url)URL.revokeObjectURL(url);};
 },[media.id,retry]);
 // Some browser/cache combinations do not dispatch loadeddata on reopening.
 // Read actual decoder state as well, and explicitly load every fresh Blob URL.
 useEffect(()=>{if(!source)return;const v=video.current;if(!v)return;v.load();const check=()=>{if(Number.isFinite(v.duration)&&v.duration>0)setDuration(v.duration);if(!seekTimer.current&&!v.seeking&&v.readyState>=2){setReady(true);setError('');showFrame();}};const timer=setInterval(check,250);check();return()=>clearInterval(timer);},[source]);
 const blocked=disabled||working||loading;
 useEffect(()=>{if(!source||ready)return;const timer=setTimeout(()=>setError('O navegador não conseguiu preparar este quadro. Tente novamente ou use outra imagem de capa.'),12000);return()=>clearTimeout(timer);},[source,ready,time]);
 function seek(value:number){const v=video.current;if(!v||!Number.isFinite(value)||!duration)return;v.pause();const at=Math.max(0,Math.min(duration-.001,value));setTime(at);setReady(false);if(seekTimer.current)clearTimeout(seekTimer.current);seekTimer.current=setTimeout(()=>{seekTimer.current=null;if(Math.abs(v.currentTime-at)>.001){setReady(false);setError('');v.currentTime=at;}else setReady(v.readyState>=2&&!v.seeking);},120);}

 async function capture(){const v=video.current;if(!v||blocked||!ready||seekTimer.current||v.seeking||v.readyState<2)return;v.pause();setWorking(true);setError('');try{
  if(!v.videoWidth||!v.videoHeight)throw Error('O vídeo ainda não está pronto.');
  const scale=Math.min(1,1080/v.videoWidth,1920/v.videoHeight),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(v.videoWidth*scale));canvas.height=Math.max(1,Math.round(v.videoHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a capa neste navegador.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(v,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível capturar o frame.')),'image/jpeg',.92));
  const name=media.name.replace(/\.[^.]+$/,'').slice(0,90)+'-frame-'+v.currentTime.toFixed(2)+'s.jpg';
  if(await onPick(new File([blob],name,{type:'image/jpeg'})))onClose();
 }catch(e:any){setError(e.message??'Não foi possível capturar o frame.');}finally{setWorking(false);}}
 return <div className="video-cover-picker" aria-label="Escolher frame do vídeo">
  <h4>Escolher frame do vídeo</h4><p className="small">{media.name} · Arraste a posição, pause no quadro desejado e confirme. A capa será salva como uma imagem na biblioteca.</p>
  {source&&!ready&&!error&&<p role="status">Preparando o quadro do vídeo…</p>}{loading&&<p role="status">Carregando vídeo para selecionar a capa… {progress}%</p>}
  <video ref={video} src={source||undefined} controls playsInline preload="auto" style={{display:'block',width:'100%',maxHeight:320,objectFit:'contain',background:'#111',borderRadius:12}}
   onLoadedMetadata={e=>{const v=e.currentTarget;if(Number.isFinite(v.duration)&&v.duration>0){setDuration(v.duration);setError('');if(v.readyState>=2&&!v.seeking)setReady(true);}else setError('Não foi possível identificar a duração do vídeo.');}}
   onLoadedData={()=>{setReady(!seekTimer.current&&!video.current?.seeking);setError('');}} onCanPlay={()=>setReady(!seekTimer.current&&!video.current?.seeking)} onSeeking={()=>setReady(false)} onSeeked={()=>{setReady(!seekTimer.current);setError('');}} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)}
   onError={()=>{setReady(false);setError('Não foi possível abrir este vídeo. O navegador pode não suportar o codec. Use um MP4 compatível ou envie uma imagem de capa.');}}/>
  <label className="field"><span>Posição do frame: {time.toFixed(2)} s / {duration.toFixed(2)} s</span><input aria-label="Posição do frame no vídeo" type="range" min="0" max={Math.max(0,duration-.001)} step="0.01" value={Math.min(time,Math.max(0,duration-.001))} disabled={blocked||!duration} onChange={e=>seek(Number(e.target.value))}/></label>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="button" disabled={blocked||!duration} onClick={()=>seek(time-.1)}>−0,1 s</button><button type="button" className="button" disabled={blocked||!duration} onClick={()=>seek(time+.1)}>+0,1 s</button><button type="button" className="button primary" disabled={blocked||!ready||!duration} onClick={()=>void capture()}>{working?'Preparando capa…':'Usar este frame como capa'}</button><button type="button" className="text-button" disabled={working||disabled} onClick={onClose}>Fechar seleção</button></div>
  {error&&<div role="alert"><p>{error}</p><button type="button" className="button" disabled={working||disabled} onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></div>}<p className="small muted">O Instagram pode recortar a capa no feed e na grade do perfil. A seleção não altera o vídeo original.</p>
 </div>;
}
