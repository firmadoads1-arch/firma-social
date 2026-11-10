let scope:{project?:string;group?:string|null}={};
const uploadIds=new WeakMap<Blob,string>(),libraryIds=new WeakMap<Blob,string>();
export function configureProject(value:typeof scope){scope={...value};}
export function rememberLibraryFile(file:File,id:string){libraryIds.set(file,id);}
export function firmaComposerURL(id:string){return '/?view=content&prismaMedia='+encodeURIComponent(id)+(scope.group?'&group='+encodeURIComponent(scope.group):'');}
export function prismaURL(path:string){const url=new URL('/api/prisma/'+path,location.origin);if(scope.project)url.searchParams.set('project',scope.project);if(scope.group)url.searchParams.set('group',scope.group);return url.toString();}
export async function api(path:string,options:RequestInit={}){
 const url=new URL(prismaURL(path)),upload=options.method==='POST'&&url.pathname==='/api/prisma/files'&&options.body instanceof Blob;
 if(upload){const blob=options.body as Blob,library=libraryIds.get(blob);if(url.searchParams.get('kind')==='original'&&library)return{id:library};let uploadId=uploadIds.get(blob);if(!uploadId){uploadId=crypto.randomUUID();uploadIds.set(blob,uploadId);}const metadata=JSON.parse(url.searchParams.get('metadata')??'{}');if(metadata.outputId)uploadId=metadata.outputId;url.searchParams.set('uploadId',uploadId!);}
 let response:Response|undefined,data:any;
 try{response=await fetch(url,options);data=await response.json();if(response.ok)return data;if(response.status<500)throw Error(data.error||'Não foi possível concluir.');}
 catch(error){if(response&&response.status<500)throw error;if(!upload)throw error;}
 if(upload){
  // A timeout may follow a successful commit. Inspect the receipt before another save.
  const status=new URL(url);status.searchParams.delete('settings');status.searchParams.delete('metadata');
  try{const check=await fetch(status,{signal:options.signal}),saved=await check.json() as any;if(check.ok&&saved?.id===url.searchParams.get('uploadId'))return saved;}catch{}
  throw Error('Não foi possível confirmar o salvamento. Confira a biblioteca antes de tentar de novo; o arquivo continua disponível para baixar.');
 }
 throw Error(data?.error||'Não foi possível concluir.');
}
export const post=(path:string,data:unknown={})=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
