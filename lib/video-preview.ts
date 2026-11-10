// One immutable library video, max 50 MB, retained only in tab memory.
let cached:{id:string;blob:Blob}|null=null;
export async function loadPreviewVideo(id:string,signal:AbortSignal,progress:(percent:number)=>void){
 if(cached?.id===id){progress(100);return cached.blob;}
 const r=await fetch('/api/media/'+encodeURIComponent(id),{signal,credentials:'same-origin',redirect:'error'});
 if(!r.ok||!r.body)throw Error('Não foi possível carregar o vídeo. Tente novamente.');
 const total=Number(r.headers.get('content-length'))||0,limit=50*1024*1024;
 if(total>limit){await r.body.cancel();throw Error('O vídeo excede o limite de 50 MB.');}
 const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('O vídeo excede o limite de 50 MB.');chunks.push(value);progress(total?Math.min(99,Math.round(size/total*100)):0);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}
 if(!size)throw Error('O vídeo está vazio.');
 const blob=new Blob(chunks as BlobPart[],{type:r.headers.get('content-type')||'video/mp4'});cached={id,blob};progress(100);return blob;
}
