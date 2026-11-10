'use client';
import {useEffect,useRef,useState} from 'react';
import {paintAvatar} from '../../lib/prisma/profile-layout';
import {type ProfileCrop} from '../../lib/prisma/profile-types';
export default function ProfileAvatar({src,crop,className='',label='Foto do perfil'}:{src:string;crop?:ProfileCrop|null;className?:string;label?:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let stopped=false;setFailed(false);const photo=new Image();photo.onload=()=>{if(stopped)return;const g=canvas.current?.getContext('2d');if(!g)return;g.clearRect(0,0,320,320);paintAvatar(g,photo,photo.naturalWidth,photo.naturalHeight,0,0,320,crop);};photo.onerror=()=>{if(!stopped)setFailed(true);};photo.src=src;return()=>{stopped=true;photo.onload=null;photo.onerror=null;};},[src,crop?.x,crop?.y,crop?.zoom]);
 return <canvas ref={canvas} width={320} height={320} className={'profile-avatar-canvas '+className} role="img" aria-label={failed?'Foto indisponível':label}/>;
}
