import {z} from 'zod';
import {safeHttps} from './security';

export const storyLinkInput=z.object({
 url:z.string().trim().min(1,'Informe o link do Story ou desative a opção de link.').max(2048).transform((value,ctx)=>{
  try{return safeHttps(value);}catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:'Use um link HTTPS público, sem usuário ou senha no endereço.'});return z.NEVER;}
 }),
 label:z.string().trim().max(60,'Use até 60 caracteres no texto do adesivo.').default(''),
});
export type StoryLink=z.infer<typeof storyLinkInput>;
export function isLinkedStory(post:{format:string;options:Record<string,any>}){
 return post.format==='story'&&!!post.options.instagramStoryLink;
}
export function manualStory(post:{format:string;options:Record<string,any>}){return isLinkedStory(post)||(post.format==='story'&&post.options.locationMode==='sticker');}
// Stored/imported links are rendered as inert text unless they still validate.
export function storyLinkURL(value:unknown):string|null{
 if(typeof value!=='string')return null;
 try{return safeHttps(value);}catch{return null;}
}
