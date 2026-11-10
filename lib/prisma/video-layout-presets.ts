import {defaultProfileLayout,normalizeProfileLayout,type ProfileLayout} from './profile-types';
export type VideoLayoutPreset={id:string;name:string;layout:ProfileLayout};
export const videoLayoutStorageKey='prisma.video-layouts.v1';
export const videoLayoutPresets:VideoLayoutPreset[]=[
 {id:'reference',name:'Referência · com faixa',layout:{...defaultProfileLayout}},
 {id:'full-left',name:'Tela inteira · perfil à esquerda',layout:{...defaultProfileLayout,mode:'fullscreen',position:'bottom-left',handlePosition:'bottom-left',avatarScale:.22}},
 {id:'full-right',name:'Tela inteira · perfil à direita',layout:{...defaultProfileLayout,mode:'fullscreen',position:'bottom-right',handlePosition:'bottom-right',avatarScale:.22}},
 {id:'full-clean',name:'Tela inteira · vídeo limpo',layout:{...defaultProfileLayout,mode:'fullscreen',showAvatar:false,showHandle:false,showPhrase:false,opacity:0}}
];
export function serializeVideoLayouts(presets:VideoLayoutPreset[]){
 return JSON.stringify({format:'prisma-video-layouts-v1',presets:presets.map(p=>({...p,layout:normalizeProfileLayout(p.layout)}))},null,2);
}
export function parseVideoLayouts(text:string):VideoLayoutPreset[]{
 if(text.length>65536)throw Error('O arquivo de layouts deve ter até 64 KB.');
 let data:unknown;try{data=JSON.parse(text);}catch{throw Error('Arquivo de layouts inválido.');}
 const doc=data as {format?:string;presets?:unknown[]};
 if(!doc||doc.format!=='prisma-video-layouts-v1'||!Array.isArray(doc.presets)||doc.presets.length>20)throw Error('Use um arquivo de templates de vídeo do PRISMA, com até 20 layouts.');
 const ids=new Set<string>();
 return doc.presets.map(item=>{
  const p=item as VideoLayoutPreset;
  if(!p||typeof p.id!=='string'||!/^custom-[a-z0-9-]{1,80}$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>60||!p.layout||typeof p.layout!=='object')throw Error('Um dos templates de vídeo é inválido ou está repetido.');
  ids.add(p.id);return{id:p.id,name:p.name.trim(),layout:normalizeProfileLayout(p.layout)};
 });
}
