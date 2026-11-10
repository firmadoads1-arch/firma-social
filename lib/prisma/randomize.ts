import {presets,type Settings,type ToolId} from './catalog';
export const randomizableTools:ToolId[]=['cloak','advanced','profile','variants','image','audio'];
export function randomizeSettings(current:Settings,tool:ToolId,seed?:number):Settings {
  if(!randomizableTools.includes(tool))return {...current};
  const randomSeed=(seed??crypto.getRandomValues(new Uint32Array(1))[0])%2147483646+1;
  let state=randomSeed;
  const random=()=>{state=(state+0x6D2B79F5)|0;let n=state;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};
  const value=(min:number,max:number,step=1)=>Number((min+Math.floor(random()*((max-min)/step+1))*step).toFixed(2));
  const next={...current,randomSeed};
  if(tool!=='audio')Object.assign(next,{contrast:value(.88,1.28,.01),brightness:value(-.07,.07,.01),saturation:value(.72,1.4,.01),zoom:value(1.01,1.18,.01),rotation:value(-2,2),grain:value(0,5),flip:random()<.3});
  if(tool!=='image')next.speed=value(.9,1.15,.05);
  if(['cloak','advanced','profile','variants'].includes(tool))Object.assign(next,{intro:current.intro>0?value(.5,2,.5):0,outro:current.outro>0?value(.5,2,.5):0});
  if(tool==='audio'||tool==='advanced'||tool==='profile')Object.assign(next,{pitch:value(-2,2),volume:value(.85,1.15,.05),bass:value(-3,4),echo:random()<.2});
  return next;
}
export function exportVariations(tool:ToolId,settings:Settings):Settings[]{
  if(tool!=='variants')return [{...settings}];
  if(settings.randomSeed)return [{...settings},randomizeSettings(settings,'variants',settings.randomSeed+104729),randomizeSettings(settings,'variants',settings.randomSeed+209759)];
  return presets.map(p=>({...settings,...p.values}));
}
