// Render a large, entirely local workspace. A hidden player per card used to
// fetch hundreds of video metadata responses when the user opened Conteúdos.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const resolve=createRequire(realpathSync(path.resolve('node_modules/wrangler/package.json'))), {build}=resolve('esbuild');
const dir=mkdtempSync(path.join(tmpdir(),'firma-render-'));symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'dir');
try{
 const out=path.join(dir,'render.mjs');
 await build({stdin:{contents:"export {default as Dashboard} from './app/dashboard';export {Thumb} from './app/ui';export {default as Composer} from './app/composer';export {default as VideoCoverPicker} from './app/video-cover-picker';",resolveDir:process.cwd()},outfile:out,format:'esm',jsx:'automatic',bundle:true,platform:'node',packages:'external',tsconfig:'tsconfig.json'});
 const {Dashboard,Thumb,Composer,VideoCoverPicker}=await import(pathToFileURL(out)), now=Date.now(),grp='demo',a={id:'a',username:'perfil',displayName:'Perfil',platform:'instagram',state:'connected',groupId:grp};
 const media=Array.from({length:600},(_,i)=>({id:'m'+i,name:'Video '+i+'.mp4',mime:'video/mp4',size:200,duration:10,folder:'Geral',groupId:grp}));
 const posts=media.map((m,i)=>({id:'p'+i,title:'Reel '+i,caption:'',captions:{},platforms:['instagram'],accountIds:['a'],mediaIds:[m.id],format:'video',status:'scheduled',scheduledAt:now+i*60000,options:{},version:1,createdAt:now,updatedAt:now}));
 const state={groupId:grp,groups:[{id:grp,name:'Modelo teste'}],accounts:[a],media,posts,workspace:{timezone:'America/Sao_Paulo',name:'Teste'},templates:[],deliveries:[],referenceModels:[],referenceProfiles:[],rules:[],events:[],providers:Object.fromEntries(['instagram','youtube','tiktok'].map(p=>[p,{configured:true,callback:''}])),scheduler:{enabled:true,healthy:true},userName:'QA'};
 const page=view=>renderToStaticMarkup(React.createElement(Dashboard,{initial:state,initialView:view}));
 const content=page('content'),library=page('library');assert.equal((content.match(/class="post-row"/g)||[]).length,30);assert.equal((library.match(/class="media-card firma-asset/g)||[]).length,36);assert.equal((content+library).match(/<video[\s>]/g),null);assert(content.includes('Agendar lote')&&library.includes('Selecionar todos')&&library.includes('600'));assert(content.includes('Modelo teste'));
 for(const view of ['overview','content','calendar','automations','settings']){
  const html=page(view);assert(html.includes('aria-label="Motor de postagens"')&&html.includes('Verificar fila agora'),'Manual runner must remain available in a healthy grouped workspace: '+view);
 }
 console.log('✓ Botão do motor permanece visível em Visão geral, Conteúdos, Calendário, Rotinas e Configurações, inclusive com fila saudável e grupo ativo.');
 const opened=renderToStaticMarkup(React.createElement(Thumb,{media:media[0],controls:true}));assert(opened.includes('<video')&&opened.includes('/api/media/m0'));
 const composer=renderToStaticMarkup(React.createElement(Composer,{state,post:{...posts[0],status:'draft'},mutate:async()=>({}),onClose:()=>{},onSaved:()=>{},onConnect:()=>{},connecting:null,connectionNotice:null,onConnectionLink:()=>{}}));
 assert(composer.includes('Escolher frame do vídeo'));assert(composer.includes('id="composer-preview"')&&composer.includes('Ver prévia')&&composer.includes('/api/media/m0'));assert(!/\.composer-preview\s*\{[^}]*display\s*:\s*none/.test(readFileSync('app/globals.css','utf8')),'Preview must remain available on narrow screens');
 const picker=renderToStaticMarkup(React.createElement(VideoCoverPicker,{media:media[0],disabled:false,onPick:async()=>true,onClose:()=>{}}));
 assert(picker.includes('Carregando vídeo para selecionar a capa')&&picker.includes('Posição do frame no vídeo')&&picker.includes('Usar este frame como capa'));
 assert(!picker.includes('autoplay'));
 console.log('✓ Seletor de capa usa vídeo privado, controle de posição e confirmação sem reprodução automática.');
 console.log('✓ 600 vídeos: Conteúdos renderiza 30 linhas, Biblioteca 36 cartões e nenhum player nas listas. A prévia sob demanda contém o player.');
}finally{rmSync(dir,{recursive:true,force:true});}
