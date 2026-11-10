'use client';
import {useEffect,useRef} from 'react';
import {api} from '../../lib/prisma/client-api';
import {detectProfileCrop} from '../../lib/prisma/face-crop';
import {templatePhoto,type ProfileTemplate} from '../../lib/prisma/profile-types';
export function useTemplateFraming(templates:ProfileTemplate[],paused:boolean,updated:(template:ProfileTemplate)=>void){
 const latest=useRef(updated),tried=useRef(new Set<string>());latest.current=updated;
 useEffect(()=>{
  if(paused)return;let stopped=false;
  void(async()=>{for(const template of templates){
   const key=template.id+':'+template.updated;if(template.crop||tried.current.has(key))continue;if(stopped)break;
   try{
    const response=await fetch(templatePhoto(template));if(!response.ok)continue;
    const result=await detectProfileCrop(await response.blob());if(stopped)break;
    tried.current.add(key);
    // Save only confident face detections; a manual crop remains available for other photos.
    if(!result.detected)continue;
    const record=await api('templates/'+template.id+'?'+new URLSearchParams({handle:template.handle,crop:JSON.stringify(result.crop),expected_updated:String(template.updated)}),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!stopped)latest.current(record);
   }catch{tried.current.add(key);}
  }})();
  return()=>{stopped=true;};
 },[templates,paused]);
}
