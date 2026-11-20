import {z} from 'zod';

export const captionGeneratorInput=z.object({
 theme:z.string().trim().max(500).default(''),
 style:z.enum(['casual','engaging','professional']).default('casual'),
 cta:z.enum(['comment','save','share','none']).default('comment'),
 hashtags:z.string().trim().max(500).default(''),
 includeVideoName:z.boolean().default(false),
 seed:z.number().int().min(0).max(1000000).default(0)
});
export const defaultCaptionGenerator=captionGeneratorInput.parse({});
export const reelContentInput=z.object({
 coverMode:z.enum(['account','custom','frame']).default('account'),
 coverId:z.string().uuid().nullable().default(null),
 captionMode:z.enum(['common','unique']).default('common'),
 captionGenerator:captionGeneratorInput.default({}),
 videoCaptions:z.record(z.string().uuid(),z.string().trim().min(1).max(2200)).refine(v=>Object.keys(v).length<=100,'Use no máximo 100 legendas por rotina.').default({})
}).superRefine((v,ctx)=>{
 if(v.coverMode==='custom'&&!v.coverId)ctx.addIssue({code:'custom',path:['coverId'],message:'Escolha a capa padrão da rotina.'});
 if(v.captionMode==='unique'&&!v.captionGenerator.theme.replace(/[.!?]+$/,'').trim())ctx.addIssue({code:'custom',path:['captionGenerator','theme'],message:'Informe o tema para gerar as legendas dos vídeos.'});
});
export type CaptionGenerator=z.infer<typeof captionGeneratorInput>;
export type ReelContent=z.infer<typeof reelContentInput>;
type Video={id:string;name:string;createdAt?:number;created_at?:number};
const hooks:Record<CaptionGenerator['style'],string[]>={
 casual:['Um novo momento por aqui.','Uma pausa para compartilhar.','Um registro que merece espaço.','Mais um vídeo para a nossa conversa.','Tem novidade no feed.','Um pouco de inspiração para hoje.','Vale reservar um instante.','Bora dar o play?','Um convite para olhar com calma.','Uma ideia para acompanhar o seu dia.','Uma nova perspectiva por aqui.','Compartilhando mais um pedacinho.'],
 engaging:['Qual vai ser a sua primeira impressão?','Esse vídeo merece a sua atenção.','Dê o play e entre na conversa.','Uma nova ideia para descobrir.','Que tal olhar por outro ângulo?','O próximo assunto começa aqui.','Uma pausa no feed pode render uma boa conversa.','Tem um novo ponto de vista esperando por você.','Um convite para descobrir mais.','O que você acrescentaria a essa conversa?','Um tema para explorar juntos.','Vamos trocar ideias?'],
 professional:['Uma nova perspectiva em destaque.','Conteúdo para ampliar a conversa.','Um tema que merece atenção.','Informação e novas possibilidades.','Mais um olhar sobre o assunto.','Uma oportunidade para refletir.','Conectando ideias e experiências.','Um conteúdo para acompanhar com atenção.','Perspectivas que ajudam a construir repertório.','Um novo registro para compartilhar.','Conhecimento se constrói em cada conversa.','Uma proposta para explorar novas ideias.']
};
const bodies=[
 (t:string)=>t,
 (t:string)=>'Hoje o assunto é '+t+'.',
 (t:string)=>'Um espaço para conversar sobre '+t+'.',
 (t:string)=>'Dando continuidade à nossa conversa sobre '+t+'.',
 (t:string)=>'Mais uma perspectiva sobre '+t+'.',
 (t:string)=>'Para quem acompanha '+t+'.',
 (t:string)=>'Explorando o tema: '+t+'.',
 (t:string)=>'Uma nova publicação sobre '+t+'.',
 (t:string)=>'Seguimos compartilhando ideias sobre '+t+'.',
 (t:string)=>'O tema deste registro: '+t+'.'
];
const calls={comment:'O que você achou? Conte nos comentários.',save:'Salve para encontrar este vídeo depois.',share:'Compartilhe com alguém que pode gostar deste tema.',none:''};
export const captionKey=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function captionVideoName(name:string){return name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim().slice(0,120)||'Vídeo';}

// Local template generator. The same implementation drives the editor preview
// and the worker; no external model, provider token or video analysis is used.
export function reelCaptions(videos:Video[],generator:CaptionGenerator,overrides:Record<string,string>={}):Record<string,string>{
 const g=captionGeneratorInput.parse(generator),theme=g.theme.replace(/[.!?]+$/,'');
 if(!theme)throw new Error('Informe o tema para gerar as legendas dos vídeos.');
 const ordered=[...videos].sort((a,b)=>(a.createdAt??a.created_at??0)-(b.createdAt??b.created_at??0)||(a.id<b.id?-1:a.id>b.id?1:0));
 if(ordered.length>100)throw new Error('Use uma pasta com até 100 vídeos.');
 const out:Record<string,string>={},used=new Set<string>(),open=hooks[g.style],variants=open.length*bodies.length;
 for(const m of ordered){if(Object.prototype.hasOwnProperty.call(overrides,m.id)){const value=overrides[m.id].trim();if(!value)throw new Error('Preencha a legenda de cada vídeo.');if(value.length>2200)throw new Error('Cada legenda pode ter até 2.200 caracteres.');if(used.has(captionKey(value)))throw new Error('Há legendas repetidas. Cada vídeo precisa de uma legenda diferente.');out[m.id]=value;used.add(captionKey(value));}}
 for(const [i,m] of ordered.entries()){
  if(out[m.id])continue;
  for(let attempt=0;attempt<variants;attempt++){
   const slot=(i+g.seed+attempt)%variants;
   const value=[open[slot%open.length],bodies[Math.floor(slot/open.length)](theme),g.includeVideoName?captionVideoName(m.name):'',calls[g.cta],g.hashtags].filter(Boolean).join('\n\n');
   if(!used.has(captionKey(value))){out[m.id]=value;used.add(captionKey(value));break;}
  }
  if(!out[m.id])throw new Error('Não foi possível gerar uma legenda diferente para cada vídeo. Gere novas legendas.');
 }
 return out;
}
