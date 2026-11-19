/** Bound queue requests, including body reads. A timeout never retries a POST. */
export async function runnerRequest(url:string,options?:RequestInit,timeoutMs=65000):Promise<any>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   (async()=>{const response=await fetch(url,{...options,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',...options?.headers}});const data:any=await response.json();if(!response.ok)throw Error(data.error??'Não foi possível consultar o motor.');return data;})(),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('O motor demorou a responder. O resultado precisa ser conferido antes de qualquer novo envio.'));},timeoutMs);})
  ]);
 }finally{clearTimeout(timer);}
}
