import {avatarCropRect,normalizeProfileLayout,profileGeometry,type ProfileLayout,type ProfileRender,type ProfileCrop} from './profile-types';
function cover(ctx:CanvasRenderingContext2D,image:CanvasImageSource,iw:number,ih:number,x:number,y:number,w:number,h:number){
 const scale=Math.max(w/iw,h/ih),sw=w/scale,sh=h/scale;ctx.drawImage(image,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h);
}
function textLines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number){
 const lines:string[]=[];let line='';for(const word of text.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);return lines;
}
export function paintAvatar(ctx:CanvasRenderingContext2D,photo:CanvasImageSource,iw:number,ih:number,x:number,y:number,size:number,crop?:ProfileCrop|null){
 const rect=avatarCropRect(iw,ih,crop);ctx.drawImage(photo,rect.x,rect.y,rect.side,rect.side,x,y,size,size);
}
function circle(ctx:CanvasRenderingContext2D,photo:CanvasImageSource,iw:number,ih:number,cx:number,cy:number,diameter:number,k:number,crop?:ProfileCrop|null){
 ctx.save();ctx.beginPath();ctx.arc(cx,cy,diameter/2,0,Math.PI*2);ctx.clip();paintAvatar(ctx,photo,iw,ih,cx-diameter/2,cy-diameter/2,diameter,crop);ctx.restore();
 ctx.beginPath();ctx.arc(cx,cy,diameter/2,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=2*k;ctx.stroke();
}
function labelStyle(ctx:CanvasRenderingContext2D,k:number){ctx.fillStyle='#fff';ctx.strokeStyle='rgba(0,0,0,.85)';ctx.lineWidth=5*k;ctx.lineJoin='round';ctx.textBaseline='middle';}
function paintFullscreen(ctx:CanvasRenderingContext2D,photo:CanvasImageSource,iw:number,ih:number,width:number,height:number,handle:string,s:Required<ProfileLayout>,crop?:ProfileCrop|null){
 const k=width/1080,marginX=width*s.margin,marginY=height*s.margin,diameter=width*s.avatarScale,right=s.position.endsWith('right'),top=s.position.startsWith('top');
 const cx=right?width-marginX-diameter/2:marginX+diameter/2;
 const cy=top?marginY+diameter/2:height-marginY-diameter/2-70*k;
 if(s.showAvatar)circle(ctx,photo,iw,ih,cx,cy,diameter,k,crop);
 ctx.save();labelStyle(ctx,k);
 if(s.showHandle){
  const label='@'+handle;let font=width*s.textScale,max=width-2*marginX;
  const vertical=s.handlePosition==='right'||s.handlePosition==='left';if(vertical)max=height*.65;
  while(font>20*k){ctx.font=`900 ${font}px Arial, sans-serif`;if(ctx.measureText(label).width<=max)break;font-=k;}
  if(vertical){ctx.textAlign='center';ctx.translate(s.handlePosition==='right'?width-marginX:marginX,height*.5);ctx.rotate(s.handlePosition==='right'?-Math.PI/2:Math.PI/2);ctx.strokeText(label,0,0,max);ctx.fillText(label,0,0,max);}
  else{const alignRight=s.handlePosition==='bottom-right'||s.handlePosition==='header'&&right;ctx.textAlign=alignRight?'right':'left';ctx.strokeText(label,alignRight?width-marginX:marginX,height-marginY,max);ctx.fillText(label,alignRight?width-marginX:marginX,height-marginY,max);}
 }
 ctx.restore();
 if(s.showPhrase&&s.phrase.trim()){
  ctx.save();labelStyle(ctx,k);ctx.textAlign='center';const max=width-2*marginX;let font=width*s.textScale,lines:string[]=[];
  do{ctx.font=`900 ${font}px Arial, sans-serif`;lines=textLines(ctx,s.phrase.trim(),max);if(lines.length<=3&&lines.every(line=>ctx.measureText(line).width<=max))break;font-=k;}while(font>22*k);
  const count=Math.min(3,lines.length),lineHeight=font*1.2,blockHeight=count*lineHeight;
  const y=s.phrasePosition==='center'?height/2-blockHeight/2:s.phrasePosition==='bottom'?height-marginY-(s.showAvatar&&!top?diameter+100*k:100*k)-blockHeight:marginY+(s.showAvatar&&top?diameter+35*k:0);
  lines.slice(0,3).forEach((line,i)=>{const baseline=y+(i+.5)*lineHeight;ctx.strokeText(line,width/2,baseline,max);ctx.fillText(line,width/2,baseline,max);});ctx.restore();
 }
}
export function paintProfileLayer(ctx:CanvasRenderingContext2D,photo:CanvasImageSource,iw:number,ih:number,width:number,height:number,handle:string,settings:ProfileLayout,crop?:ProfileCrop|null){
 const s=normalizeProfileLayout(settings),geo=profileGeometry(width,height,s),k=width/1080,right=s.position.endsWith('right');
 ctx.clearRect(0,0,width,height);
 ctx.save();ctx.beginPath();ctx.rect(0,geo.bodyY,width,geo.bodyHeight);ctx.clip();ctx.globalAlpha=Math.max(0,Math.min(.4,s.opacity));cover(ctx,photo,iw,ih,0,geo.bodyY,width,geo.bodyHeight);ctx.restore();
 if(s.mode==='fullscreen'){paintFullscreen(ctx,photo,iw,ih,width,height,handle,s,crop);return;}
 ctx.fillStyle='#080809';ctx.fillRect(0,geo.headerY,width,geo.header);
 const diameter=width*s.avatarScale,inset=width*(s.margin-.03),cx=right?width-inset-diameter/2:inset+diameter/2,cy=geo.top?geo.header+height*.022:height-geo.header-height*.022;
 if(s.showAvatar)circle(ctx,photo,iw,ih,cx,cy,diameter,k,crop);
 const phrase=s.showPhrase?s.phrase.trim().slice(0,120):'',headerText=phrase||(s.showHandle&&s.handlePosition==='header'?'@'+handle:'');
 const textX=right?width*.28:width*.72,textWidth=width*.51;
 if(headerText){
  let size=64*k*s.textScale/.046,lines:string[]=[];
  do{ctx.font=`900 ${size}px Arial, sans-serif`;lines=textLines(ctx,headerText,textWidth);if(lines.length<=3&&lines.every(line=>ctx.measureText(line).width<=textWidth))break;size-=2*k;}while(size>24*k);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';const lineHeight=size*1.18;
  lines.slice(0,3).forEach((line,index)=>ctx.fillText(line,textX,geo.headerY+geo.header*.43+(index-(Math.min(3,lines.length)-1)/2)*lineHeight,textWidth));
 }
 ctx.save();ctx.fillStyle='#fff';ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=5*k;ctx.lineJoin='round';ctx.textAlign='center';ctx.textBaseline='middle';
 let font=50*k*s.textScale/.046;const label='@'+handle;
 if(!s.showHandle){ctx.restore();return;}
 if(s.handlePosition.startsWith('bottom-')){
  const max=width*.8;while(font>22*k){ctx.font=`900 ${font}px Arial, sans-serif`;if(ctx.measureText(label).width<=max)break;font-=k;}
  const alignRight=s.handlePosition==='bottom-right';ctx.textAlign=alignRight?'right':'left';const x=alignRight?width-width*s.margin:width*s.margin,y=height-height*s.margin;ctx.strokeText(label,x,y,max);ctx.fillText(label,x,y,max);
 }else if(s.handlePosition==='header'){
  const max=width*.51;while(font>22*k){ctx.font=`900 ${font}px Arial, sans-serif`;if(ctx.measureText(label).width<=max)break;font-=k;}
  if(phrase){const y=geo.headerY+geo.header*.84;ctx.strokeText(label,textX,y,max);ctx.fillText(label,textX,y,max);}
 }else{
  const max=geo.bodyHeight*.66;while(font>28*k){ctx.font=`900 ${font}px Arial, sans-serif`;if(ctx.measureText(label).width<=max)break;font-=k;}
  ctx.translate(s.handlePosition==='right'?width-48*k:48*k,geo.bodyY+geo.bodyHeight*.48);ctx.rotate(s.handlePosition==='right'?-Math.PI/2:Math.PI/2);ctx.strokeText(label,0,0,max);ctx.fillText(label,0,0,max);
 }
 ctx.restore();
}
async function canvasBlob(canvas:HTMLCanvasElement,type:string,quality?:number){return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Não foi possível preparar a foto.')),type,quality));}
export async function prepareProfilePhoto(file:File):Promise<Blob>{
 if(file.size>5*1024*1024)throw Error('Escolha uma foto de até 5 MB.');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use uma foto JPEG, PNG ou WebP.');
 const image=await createImageBitmap(file).catch(()=>{throw Error('Não foi possível abrir essa foto.');});
 try{if(image.width*image.height>24000000)throw Error('Use uma foto de até 24 megapixels.');const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const ctx=canvas.getContext('2d')!;ctx.fillStyle='#111';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return await canvasBlob(canvas,'image/jpeg',.92);}finally{image.close();}
}
export async function renderProfileLayer(profile:ProfileRender,width:number,height:number,layout:ProfileLayout):Promise<Uint8Array>{
 const photo=await createImageBitmap(profile.avatar).catch(()=>{throw Error('Não foi possível abrir a foto de @'+profile.handle+'. Atualize o template.');});
 try{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;paintProfileLayer(canvas.getContext('2d')!,photo,photo.width,photo.height,width,height,profile.handle,layout,profile.crop);return new Uint8Array(await(await canvasBlob(canvas,'image/png')).arrayBuffer());}finally{photo.close();}
}
