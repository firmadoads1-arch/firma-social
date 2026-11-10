'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,FolderPlus,FolderOpen,Loader2} from 'lucide-react';
import Studio from './studio';
import {api,post,configureProject} from '../../lib/prisma/client-api';
import './globals.css';
import './integration.css';
type Project={id:string;name:string;folder:string;groupId:string|null};
export default function PrismaWorkspace({group,userName,publicWorkspace}:{group:string|null;userName:string;publicWorkspace:boolean}){
 const [projects,setProjects]=useState<Project[]>([]),[selected,setSelected]=useState(''),[name,setName]=useState(''),[creating,setCreating]=useState(false),[locked,setLocked]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 useEffect(()=>{configureProject({group});let active=true;api('projects').then(rows=>{if(!active)return;setProjects(rows);const requested=new URLSearchParams(location.search).get('project');setSelected(rows.some((p:Project)=>p.id===requested)?requested!:rows[0]?.id??'');}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoaded(true);});return()=>{active=false;};},[group]);
 useEffect(()=>{if(!loaded)return;configureProject({project:selected||undefined,group});const url=new URL(location.href);if(selected)url.searchParams.set('project',selected);else url.searchParams.delete('project');history.replaceState(null,'',url);},[selected,group,loaded]);
 async function create(e:React.FormEvent){e.preventDefault();setCreating(true);setError('');try{const p=await post('projects',{name});setProjects(rows=>[p,...rows]);configureProject({project:p.id,group});setSelected(p.id);setName('');}catch(e:any){setError(e.message);}finally{setCreating(false);}}
 const back='/?view=library'+(group?'&group='+encodeURIComponent(group):'');
 if(loaded)configureProject({project:selected||undefined,group});
 return <div className="prisma-app"><div className="prisma-project-bar"><a href={back}><ArrowLeft size={16}/> Firma Social</a><label>Projeto de exportação<select aria-label="Projeto de exportação" disabled={locked||creating} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecionar projeto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><form onSubmit={create}><input aria-label="Nome do novo projeto" placeholder="Novo projeto…" value={name} onChange={e=>setName(e.target.value)} maxLength={45} disabled={locked||creating}/><button className="secondary" disabled={locked||creating||!name.trim()}><FolderPlus size={16}/>{creating?'Criando…':'Criar'}</button></form><a className="secondary" href={back}><FolderOpen size={16}/> Biblioteca do Firma</a></div>{error&&<div className="error" role="alert">{error}</div>}{!loaded?<div className="app-loading"><Loader2 className="spin"/><p>Abrindo projetos…</p></div>:selected?<Studio key={selected} onBusyChange={setLocked} userName={userName} publicWorkspace={publicWorkspace}/>:<div className="empty prisma-welcome"><FolderPlus size={40}/><h1>Prisma Media Lab</h1><p>Crie um projeto acima para começar. Suas exportações serão salvas em <strong>Prisma / nome do projeto</strong>, na mesma biblioteca do Firma Social.</p></div>}</div>;
}
