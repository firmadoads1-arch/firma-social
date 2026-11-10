import type {Account,Media} from './domain';
export const defaultLocation='São Paulo, SP';
export const saoPauloPage='112047398814697';
export const locationName=(o:Record<string,any>)=>o.locationMode==='none'?'':o.location===null?'':typeof o.location==='string'?(o.location.trim()||defaultLocation):'';
export const publishCaption=(caption:string,o:Record<string,any>,format:string)=>o.locationMode==='caption'&&format!=='story'&&locationName(o)?[caption,'📍 '+locationName(o)].filter(Boolean).join('\n\n'):caption;
export const usableCover=(m:Pick<Media,'mime'|'size'>)=>m.mime==='image/jpeg'&&m.size>0&&m.size<=8*1024*1024;
const key=(v:string)=>v.trim().replace(/^@/,'').normalize('NFKC').toLowerCase();
const cache=new WeakMap<Media[],{ids:Map<string,Media>;names:Map<string,Media[]>}>();
export function accountCover(a:Pick<Account,'username'|'coverMediaId'|'groupId'>,media:Media[]){
 let ix=cache.get(media);if(!ix){ix={ids:new Map(),names:new Map()};for(const m of media){if(!usableCover(m))continue;ix.ids.set(m.id,m);const n=key(m.name.replace(/\.[^.]+$/,''));let items=ix.names.get(n);if(!items)ix.names.set(n,items=[]);items.push(m);}for(const items of ix.names.values())items.sort((x,y)=>y.createdAt-x.createdAt||x.id.localeCompare(y.id));cache.set(media,ix);}
 const indexed=ix.names.get(key(a.username))??[];return (a.coverMediaId?ix.ids.get(a.coverMediaId):undefined)??indexed.find(m=>(m.groupId??null)===(a.groupId??null))??indexed.find(m=>!m.groupId);
}
export function coverForDelivery(options:Record<string,any>,accountId:string){return options.instagramCoverMediaId??options.instagramAccountCovers?.[accountId]??null;}
