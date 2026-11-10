import {z} from 'zod';
import {platformSchema,type Platform,type Post} from './domain';
import {AppError,safeHttps} from './security';

export const referenceKinds={page:'Página / marca',creator:'Criador(a)',model:'Modelo'} as const;
export const referenceFormats={video:'Vídeo',photo:'Foto',carousel:'Carrossel',story:'Story'} as const;
export type ReferenceProfile={id:string;platform:Platform;handle:string;displayName:string;kind:keyof typeof referenceKinds;niche:string;notes:string;favorite:boolean;version:number;createdAt:number;updatedAt:number};
export type ReferenceModel={id:string;referenceId:string|null;platform:Platform;title:string;niche:string;sourceUrl:string;format:Post['format'];hook:string;outline:string;caption:string;favorite:boolean;version:number;createdAt:number;updatedAt:number};
export type ContentSeed=Pick<Post,'title'|'caption'|'platforms'|'format'> & {mediaIds?:string[]};
const hosts:Record<Platform,string[]>={instagram:['instagram.com','www.instagram.com'],tiktok:['tiktok.com','www.tiktok.com'],youtube:['youtube.com','www.youtube.com','m.youtube.com']};

export function normalizeHandle(raw:string,platform:Platform){
 let handle=raw.trim();
 if(/^https?:\/\//i.test(handle)||/^(www\.)?(instagram|tiktok|youtube)\.com\//i.test(handle)){
  const url=new URL(safeHttps(/^https?:\/\//i.test(handle)?handle:'https://'+handle));
  if(!hosts[platform].includes(url.hostname))throw new AppError('O link não pertence à rede selecionada.');
  const parts=url.pathname.split('/').filter(Boolean);
  if(parts.length!==1||(platform!=='instagram'&&!parts[0].startsWith('@')))throw new AppError('Use o @perfil ou o link do perfil, não o link de uma publicação.');
  try{handle=decodeURIComponent(parts[0]);}catch{throw new AppError('Esse endereço de perfil é inválido.');}
 }
 handle=handle.replace(/^@/,'').normalize('NFC').toLowerCase();
 const valid=platform==='youtube'?/^[\p{L}\p{M}\p{N}_.·-]+$/u:/^[a-z0-9_.]+$/;
 if(!valid.test(handle)||handle.length>(platform==='instagram'?30:100)||handle.startsWith('.')||handle.endsWith('.')||handle.includes('..'))throw new AppError('Informe um @perfil válido, sem espaços.');
 if(platform==='instagram'&&['p','reel','reels','stories','explore','accounts'].includes(handle))throw new AppError('Use o @perfil, não uma seção do Instagram.');
 return handle;
}
export function referenceURL(platform:Platform,handle:string){return `https://www.${platform==='instagram'?'instagram.com':platform==='tiktok'?'tiktok.com':'youtube.com'}/${platform==='instagram'?'':'@'}${encodeURIComponent(handle)}${platform==='instagram'?'/':''}`;}
export function referenceSource(raw:string,platform:Platform){
 if(!raw.trim())return '';
 const url=new URL(safeHttps(raw.trim()));
 const allowed=[...hosts[platform],...(platform==='youtube'?['youtu.be']:platform==='tiktok'?['vm.tiktok.com','vt.tiktok.com']:[])];
 if(!allowed.includes(url.hostname))throw new AppError('Use um link de conteúdo da rede selecionada.');
 return url.toString();
}
const identity={id:z.string().uuid().optional(),version:z.number().int().positive().optional()};
const niche=z.string().trim().max(60).default('Geral').transform(v=>v||'Geral');
export const referenceProfileInput=z.object({...identity,platform:platformSchema,handle:z.string().trim().min(1,'Informe o @perfil.').max(2048),displayName:z.string().trim().max(100).default(''),kind:z.enum(['page','creator','model']).default('page'),niche,notes:z.string().trim().max(2000).default(''),favorite:z.boolean().default(false)});
export const referenceModelInput=z.object({...identity,referenceId:z.string().uuid().nullable().default(null),platform:platformSchema,title:z.string().trim().min(1,'Dê um nome ao modelo.').max(100),niche,sourceUrl:z.string().max(2048).default(''),format:z.enum(['video','photo','carousel','story']).default('video'),hook:z.string().trim().max(500).default(''),outline:z.string().trim().max(3000).default(''),caption:z.string().max(5000).default(''),favorite:z.boolean().default(false)});
