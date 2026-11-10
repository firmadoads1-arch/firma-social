export type ProfileCrop={x:number;y:number;zoom:number};
export type ProfileTemplate={id:string;handle:string;mime:string;size:number;created:number;updated:number;crop?:ProfileCrop|null};
export type ProfileLayout={position:'top-left'|'top-right'|'bottom-left'|'bottom-right';handlePosition:'right'|'left'|'header'|'bottom-left'|'bottom-right';opacity:number;phrase:string;mode?:'band'|'fullscreen';showAvatar?:boolean;showHandle?:boolean;showPhrase?:boolean;avatarScale?:number;margin?:number;phrasePosition?:'top'|'center'|'bottom';textScale?:number};
export type ProfileRender={id:string;handle:string;avatar:Blob;crop?:ProfileCrop|null};
export const defaultProfileCrop:ProfileCrop={x:.5,y:.34,zoom:1};
export function normalizeProfileCrop(value:unknown):ProfileCrop|null{
 if(!value||typeof value!=='object')return null;
 const {x,y,zoom}=value as Record<string,unknown>;
 if(typeof x!=='number'||typeof y!=='number'||typeof zoom!=='number'||![x,y,zoom].every(Number.isFinite)||x<0||x>1||y<0||y>1||zoom<1||zoom>8)return null;
 return{x,y,zoom};
}
export function avatarCropRect(width:number,height:number,value?:ProfileCrop|null){
 const crop=normalizeProfileCrop(value)||defaultProfileCrop,side=Math.min(width,height)/crop.zoom;
 return{x:Math.max(0,Math.min(width-side,crop.x*width-side/2)),y:Math.max(0,Math.min(height-side,crop.y*height-side/2)),side};
}
export const defaultProfileLayout:ProfileLayout={position:'top-left',handlePosition:'right',opacity:.12,phrase:'',mode:'band',showAvatar:true,showHandle:true,showPhrase:true,avatarScale:.38,margin:.055,phrasePosition:'top',textScale:.046};
export function normalizeProfileLayout(value:unknown):Required<ProfileLayout>{
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const pick=<T extends string>(key:string,options:readonly T[],fallback:T):T=>options.includes(v[key] as T)?v[key] as T:fallback;
 const number=(key:string,min:number,max:number,fallback:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key] as number)):fallback;
 return{position:pick('position',['top-left','top-right','bottom-left','bottom-right'] as const,'top-left'),handlePosition:pick('handlePosition',['right','left','header','bottom-left','bottom-right'] as const,'right'),mode:pick('mode',['band','fullscreen'] as const,'band'),opacity:number('opacity',0,.4,.12),phrase:typeof v.phrase==='string'?v.phrase.slice(0,120):'',showAvatar:v.showAvatar!==false,showHandle:v.showHandle!==false,showPhrase:v.showPhrase!==false,avatarScale:number('avatarScale',.12,.4,.38),margin:number('margin',.03,.12,.055),phrasePosition:pick('phrasePosition',['top','center','bottom'] as const,'top'),textScale:number('textScale',.026,.065,.046)};
}
export const templatePhoto=(t:ProfileTemplate)=>`/api/prisma/templates/${t.id}/photo?v=${t.updated}`;
export const normalizeHandle=(value:string)=>value.trim().replace(/^@/,'').toLowerCase();
export const validHandle=(value:string)=>/^[a-z0-9._]{1,30}$/.test(value);
export function profileExportName(handle:string,generatedAt=new Date()){
 const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(generatedAt).replace(/:/g,'-');
 return `${normalizeHandle(handle)}_${time}.mp4`;
}
export function profileGeometry(width:number,height:number,layout:ProfileLayout){
 const header=layout.mode==='fullscreen'?0:Math.round(height*.145/2)*2,top=layout.position.startsWith('top');
 return{header,bodyHeight:height-header,bodyY:top?header:0,headerY:top?0:height-header,top};
}
