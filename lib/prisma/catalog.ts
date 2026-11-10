import type {ProfileLayout} from './profile-types';
export const tools = [
 {id:'cloak',name:'Cloaker de vídeo',description:'Uma nova edição. Abertura, encerramento e identidade visual.',category:'Vídeo',icon:'layers',tag:'ESSENCIAL',color:'violet'},
 {id:'advanced',name:'Cloaker avançado',description:'Cor, movimento, textura e som. Controle cada detalhe.',category:'Vídeo',icon:'sliders',tag:'CONTROLE TOTAL',color:'violet'},
 {id:'profile',name:'Cloaker Avançado para spam',description:'Seu vídeo, a identidade de cada perfil. Templates e exportação em lote.',category:'Vídeo',icon:'copy',tag:'TEMPLATES · REELS',color:'violet'},
 {id:'profile-batch',name:'Cloaker para spam · Vídeos em lote',description:'Vários vídeos, uma modelo. O mesmo template e todos os ajustes do Avançado.',category:'Vídeo',icon:'layers',tag:'VÁRIOS VÍDEOS · UM PERFIL',color:'violet'},
 {id:'remux',name:'Camuflagem de vídeo',description:'Reorganize o contêiner e renove metadados sem recodificar.',category:'Vídeo',icon:'scan',tag:'SEM RECOMPRESSÃO',color:'blue'},
 {id:'image',name:'Cloaker de imagem',description:'Explore cores, textura, enquadramento e metadados.',category:'Imagem',icon:'image',tag:'JPEG · PNG · WEBP',color:'rose'},
 {id:'audio',name:'Cloaker de áudio',description:'Ajuste tom, ritmo, volume, equalização e ambiência.',category:'Áudio',icon:'audio',tag:'ESTÚDIO DE SOM',color:'amber'},
 {id:'metadata',name:'Metadados',description:'Inspecione, limpe ou personalize os campos do arquivo.',category:'Utilitários',icon:'file',tag:'INSPECIONAR E EDITAR',color:'blue'},
 {id:'variants',name:'Variações do criativo',description:'Três direções visuais, prontas para comparar e testar.',category:'Vídeo',icon:'copy',tag:'PROCESSAMENTO EM LOTE',color:'violet'},
 {id:'formats',name:'Feed e Stories',description:'O enquadramento certo para cada formato e proporção.',category:'Vídeo',icon:'frame',tag:'4 PROPORÇÕES',color:'rose'},
 {id:'trim',name:'Cortador',description:'Escolha o início e o fim. Exporte só o que importa.',category:'Utilitários',icon:'scissors',tag:'VÍDEO E ÁUDIO',color:'amber'},
 {id:'compress',name:'Compactador',description:'Encontre o equilíbrio entre qualidade e tamanho.',category:'Utilitários',icon:'minimize',tag:'EXPORTAÇÃO OTIMIZADA',color:'green'},
 {id:'watermark',name:"Remover marca d’água",description:'Selecione uma região e reconstrua a área pelas bordas.',category:'Vídeo',icon:'eraser',tag:'SELEÇÃO DE ÁREA',color:'green'},
 {id:'compare',name:'Detector',description:'Compare hashes, imagens e informações de duas versões.',category:'Análise',icon:'compare',tag:'MÉTRICAS REAIS',color:'blue'},
] as const;
export type ToolId = typeof tools[number]['id'];
export type Settings={profileEncoding?:'fast'|'balanced';profileLayout?:ProfileLayout;profileTemplate?:{id:string;handle:string};randomSeed?:number;contrast:number;brightness:number;saturation:number;zoom:number;rotation:number;grain:number;speed:number;flip:boolean;volume:number;pitch:number;echo:boolean;bass:number;ratio:string;fit:string;maxSide:number;crf:number;start:number;end:number;intro:number;outro:number;introText:string;outroText:string;overlay:string;metaMode:string;title:string;author:string;software:string;make:string;model:string;rectX:number;rectY:number;rectW:number;rectH:number;imageFormat:string;audioFormat:string};
export const defaults:Settings={randomSeed:0,contrast:1,brightness:0,saturation:1,zoom:1,rotation:0,grain:0,speed:1,flip:false,volume:1,pitch:0,echo:false,bass:0,ratio:'original',fit:'crop',maxSide:1280,crf:22,start:0,end:0,intro:0,outro:0,introText:'Uma nova perspectiva',outroText:'Até a próxima.',overlay:'',metaMode:'strip',title:'',author:'',software:'',make:'',model:'',rectX:10,rectY:10,rectW:20,rectH:10,imageFormat:'jpg',audioFormat:'mp3'};
export const presets=[{name:'Natural',note:'Tons equilibrados, detalhe preservado.',values:{contrast:1.04,saturation:1.05,brightness:0.01,zoom:1.02,rotation:0,grain:0,speed:1}},{name:'Cinema',note:'Contraste profundo e textura discreta.',values:{contrast:1.14,saturation:0.8,brightness:-0.025,zoom:1.08,rotation:0,grain:3,speed:1}},{name:'Vibrante',note:'Cor expressiva e um ritmo renovado.',values:{contrast:1.12,saturation:1.35,brightness:0.02,zoom:1.12,rotation:1,grain:1,speed:1.05}}];
export const formatBytes=(v:number)=>v<1024*1024?`${(v/1024).toFixed(0)} KB`:`${(v/1024/1024).toFixed(1)} MB`;
