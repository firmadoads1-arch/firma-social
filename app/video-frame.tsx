'use client';
import {useEffect,useRef,useState} from 'react';
import type {Media} from '@/lib/domain';

// Load only visible previews and release the decoder once a still is captured.
export default function VideoFrame({media}:{media:Media}){
 const box=useRef<HTMLSpanElement>(null),[frame,setFrame]=useState(''),[failed,setFailed]=useState(false);
 useEffect(()=>{
  setFrame('');setFailed(false);let video:HTMLVideoElement|undefined,timer:ReturnType<typeof setTimeout>|undefined,disposed=false;
  function release(){if(timer)clearTimeout(timer);if(video){video.onloadedmetadata=null;video.onseeked=null;video.onerror=null;video.pause();video.removeAttribute('src');video.load();video=undefined;}}
  function fail(){if(!disposed)setFailed(true);release();}
  function capture(){if(!video||disposed)return;try{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160*video.videoHeight/video.videoWidth;const ctx=canvas.getContext('2d');if(!ctx)throw Error();ctx.drawImage(video,0,0,canvas.width,canvas.height);setFrame(canvas.toDataURL('image/jpeg',.75));release();}catch{fail();}}
  function load(){video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.onloadedmetadata=()=>{if(video)video.currentTime=Math.min(1,Number.isFinite(video.duration)?Math.max(.01,video.duration/2):1);};video.onseeked=capture;video.onerror=fail;timer=setTimeout(fail,25000);video.src='/api/media/'+encodeURIComponent(media.id);video.load();}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'100px'});
  if(box.current)observer.observe(box.current);
  return()=>{disposed=true;observer.disconnect();release();};
 },[media.id]);
 return <span ref={box} style={{display:'inline-flex',width:72,height:96,flexShrink:0,alignItems:'center',justifyContent:'center',background:'#161616',borderRadius:6,overflow:'hidden'}}>{frame?<img src={frame} alt={'Frame de '+media.name} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<span style={{fontSize:11,textAlign:'center',color:'#aaa'}}>{failed?'Prévia indisponível':'Carregando frame…'}</span>}</span>;
}
