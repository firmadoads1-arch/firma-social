import {publishCaption} from './editor-defaults';
import { z } from 'zod';
import {storyLinkInput} from './story-links';
import type {ReferenceProfile,ReferenceModel} from './references';
export const platformSchema = z.enum(['instagram','tiktok','youtube']);
export type Platform = z.infer<typeof platformSchema>;
export const platforms: Platform[] = ['instagram','tiktok','youtube'];
export const platformNames = {instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube'};
export const statusNames: Record<string,string> = {manual_pending:'Finalizar no Instagram',manual_published:'Publicado manualmente',draft:'Rascunho',pending_approval:'Em revisão',scheduled:'Agendado',publishing:'Em publicação',published:'Publicado',partial:'Parcial',failed:'Precisa de atenção',cancelled:'Cancelado',uncertain:'Conferir na rede',processing:'Processando',pending:'Na fila',inbox:'Na caixa de entrada'};
export type Media = {id:string;name:string;mime:string;size:number;groupId?:string|null;width:number|null;height:number|null;duration:number|null;folder:string;publicUrl:string|null;createdAt:number};
export type Account = {id:string;platform:Platform;username:string;displayName:string;groupId?:string|null;coverMediaId?:string|null;nativeLocation?:boolean;resolvedCoverId?:string|null;resolvedCoverName?:string|null;state:string;expiresAt:number|null};
export type Post = {id:string;groupId?:string|null;batchId?:string|null;batchPosition?:number|null;title:string;caption:string;captions:Partial<Record<Platform,string>>;platforms:Platform[];accountIds:string[];mediaIds:string[];format:'video'|'photo'|'carousel'|'story';status:string;scheduledAt:number|null;options:Record<string,any>;version:number;createdAt:number;updatedAt:number};
export type Delivery = {id:string;postId:string;accountId:string;platform:Platform;status:string;remoteId:string|null;error:string|null;updatedAt:number};
export type ProviderReadiness={configured:boolean;clientId:string;publicMediaBase:string;reviewed:boolean;callback:string};
export type AppState={referenceMedia?:Media[];groupId?:string|null;groups?:{id:string;name:string}[];referenceProfiles:ReferenceProfile[];referenceModels:ReferenceModel[];workspace:{name:string;timezone:string};media:Media[];posts:Post[];accounts:Account[];deliveries:Delivery[];templates:{id:string;name:string;caption:string}[];rules:any[];events:{id:string;title:string;detail:string;createdAt:number}[];providers:Record<Platform,ProviderReadiness>;scheduler:{enabled:boolean;intervalMinutes:number;lastCheckedAt:string|null;healthy:boolean;delayedCount:number};userName:string;publicWorkspace?:boolean};
export const postInput = z.object({id:z.string().uuid().optional(),version:z.number().int().positive().optional(),title:z.string().trim().min(1,'Dê um título ao conteúdo.').max(100),caption:z.string().max(5000).default(''),captions:z.object({instagram:z.string().max(2200).optional(),tiktok:z.string().max(2200).optional(),youtube:z.string().max(5000).optional()}).default({}),platforms:z.array(platformSchema).min(1,'Escolha pelo menos uma rede.').max(3),accountIds:z.array(z.string().uuid()).max(40).default([]),mediaIds:z.array(z.string().uuid()).max(10).default([]),format:z.enum(['video','photo','carousel','story']).default('video'),status:z.enum(['draft','pending_approval','scheduled']).default('draft'),scheduledAt:z.number().int().positive().nullable().default(null),options:z.object({location:z.string().trim().max(100).nullable().optional(),locationMode:z.enum(['caption','native','none','sticker']).optional(),placeId:z.string().regex(/^[0-9]{3,25}$/).nullable().optional(),coverMode:z.enum(['account','custom','frame']).optional(),instagramAccountCovers:z.record(z.string().uuid(),z.string().uuid()).optional(),instagramStoryLink:storyLinkInput.nullable().default(null),instagramCoverMediaId:z.string().uuid().nullable().default(null),youtubePrivacy:z.enum(['private','unlisted','public']).default('private'),madeForKids:z.boolean().default(false),tiktokPrivacy:z.string().max(50).optional(),disableComment:z.boolean().default(true),disableDuet:z.boolean().default(true),disableStitch:z.boolean().default(true),tiktokConsent:z.boolean().default(false),tiktokMode:z.enum(['inbox','direct']).default('inbox'),containsSyntheticMedia:z.boolean().default(false),brandContent:z.boolean().default(false),brandOrganic:z.boolean().default(false)}).default({})}).superRefine((p,ctx)=>{if(p.options.instagramStoryLink&&(p.format!=='story'||p.platforms.length!==1||p.platforms[0]!=='instagram'))ctx.addIssue({code:z.ZodIssueCode.custom,message:'O link é exclusivo de Stories do Instagram. Remova o link antes de mudar o formato ou as redes.'});});
export function validatePublishing(p:z.infer<typeof postInput>,assets:Media[],accounts:Account[],now=Date.now(),immediate=false) {
 const issues:string[]=[];
 if(!p.accountIds.length) issues.push('Conecte e selecione uma conta antes de agendar.');
 if(!assets.length) issues.push('Adicione uma mídia ao conteúdo.');
 if(p.accountIds.some(id=>!accounts.find(a=>a.id===id&&a.state==='connected'))) issues.push('Há uma conta desconectada ou indisponível.');
 if(accounts.some(a=>p.accountIds.includes(a.id)&&!p.platforms.includes(a.platform)))issues.push('A conta escolhida não pertence às redes selecionadas.');
 for(const platform of p.platforms){
  if(!accounts.some(a=>p.accountIds.includes(a.id)&&a.platform===platform))issues.push(`Selecione uma conta do ${platformNames[platform]}.`);
  const cap=publishCaption(p.captions[platform]??p.caption,p.options,p.format);
  if(cap.length>(platform==='youtube'?5000:2200))issues.push(`A legenda ultrapassa o limite de ${platformNames[platform]}.`);
 }
 if(!immediate&&p.scheduledAt===null)issues.push('Escolha a data e o horário de publicação.');
 if(!immediate&&p.scheduledAt!==null&&p.scheduledAt<now+60000)issues.push('Escolha um horário pelo menos um minuto à frente.');
 if(p.platforms.includes('instagram')){if(assets.some(a=>a.mime.startsWith('image/')&&a.mime!=='image/jpeg'))issues.push('O Instagram requer imagens JPEG. Converta no Estúdio de imagem.');if(assets.some(a=>a.mime==='video/webm'))issues.push('Use MP4 ou MOV para vídeos no Instagram.');if(assets.some(a=>a.mime.startsWith('image/')&&a.size>8*1024*1024))issues.push('Imagens para Instagram devem ter no máximo 8 MB.');}
 if(p.platforms.includes('tiktok')&&p.options.tiktokMode!=='direct'&&assets.some(a=>a.duration&&a.duration>600))issues.push('O envio para a caixa de entrada do TikTok aceita vídeos de até 10 minutos.');
 if(p.format==='video'&&(assets.length!==1||!assets[0]?.mime.startsWith('video/')))issues.push('Vídeo requer exatamente um arquivo de vídeo.');
 if(p.format==='photo'&&(assets.length!==1||!assets[0]?.mime.startsWith('image/')))issues.push('Foto requer exatamente uma imagem.');
 if(p.format==='carousel'&&(assets.length<2||assets.some(a=>!/^(image|video)\//.test(a.mime))))issues.push('Carrossel requer de 2 a 10 imagens ou vídeos.');
 if(p.platforms.includes('youtube')&&p.format!=='video')issues.push('A integração YouTube aceita vídeos nesta versão.');
 if(p.platforms.includes('tiktok')&&p.format!=='video')issues.push('A integração TikTok aceita vídeos nesta versão.');
 if(p.format==='story'&&(p.platforms.some(x=>x!=='instagram')||assets.length!==1))issues.push('Stories requer uma única mídia e somente Instagram.');
 if(p.platforms.includes('tiktok')&&p.options.tiktokMode==='direct'&&accounts.filter(a=>p.accountIds.includes(a.id)&&a.platform==='tiktok').length>1)issues.push('Agende uma conta TikTok por vez no modo de publicação direta.');
 if(p.platforms.includes('tiktok')&&p.options.tiktokMode==='direct'&&assets.some(a=>!a.duration))issues.push('Não foi possível ler a duração do vídeo. Reenvie o arquivo antes de usar publicação direta.');
 if(p.options.brandContent&&p.options.tiktokMode==='direct'&&p.options.tiktokPrivacy==='SELF_ONLY')issues.push('Conteúdo de marca no TikTok não pode usar Somente eu.');
 if(p.platforms.includes('tiktok')&&p.options.tiktokMode==='direct'&&(!p.options.tiktokConsent||!p.options.tiktokPrivacy))issues.push('Confira a privacidade e autorize o envio direto ao TikTok.');
 return [...new Set(issues)];
}
export function localToEpoch(value:string,timezone:string):number {
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);if(!m)throw new Error('Data inválida.');
 const target=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);if(new Date(target).toISOString().slice(0,16)!==value)throw new Error('Data inválida.');let guess=target;
 for(let i=0;i<3;i++){const a=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(guess);const g=(t:string)=>Number(a.find(x=>x.type===t)?.value);const wall=Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'));guess+=target-wall;}
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(guess).replace(' ','T');if(parts!==value)throw new Error('Esse horário não existe no fuso selecionado.');
 return guess;
}
export function formatBytes(n:number){return n<1024*1024?`${Math.round(n/1024)} KB`:`${(n/1024/1024).toFixed(1)} MB`;}

export function nextLocalDate(now:number,timezone:string){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+1);return day.toISOString().slice(0,10);
}

export function validateReelCover(p:{format:string;platforms:string[];options:Record<string,any>},media:Media[]){
 const coverId=p.options.instagramCoverMediaId;if(!coverId)return;
 if(p.format!=='video'||!p.platforms.includes('instagram'))return 'A capa personalizada é exclusiva de Reels do Instagram.';
 const cover=media.find(m=>m.id===coverId);
 if(!cover)return 'A capa não foi encontrada na sua biblioteca.';
 if(cover.mime!=='image/jpeg'||cover.size>8*1024*1024)return 'Use uma capa JPG de até 8 MB. Converta outras imagens no Estúdio de imagem.';
}
