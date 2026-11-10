// Store-only ZIP: MP4 is already compressed. Keep UTF-8 profile filenames intact.
const table=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const crc32=(bytes:Uint8Array)=>{let crc=0xffffffff;for(const value of bytes)crc=table[(crc^value)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;};
export async function createZip(files:{name:string;blob:Blob}[]){
 const total=files.reduce((n,file)=>n+file.blob.size,0);if(total>512*1024*1024)throw Error('Este lote supera 512 MB. Baixe os vídeos individualmente pela lista ou pela biblioteca.');
 const local:BlobPart[]=[],central:BlobPart[]=[];let offset=0,centralSize=0;
 for(const file of files){const data=new Uint8Array(await file.blob.arrayBuffer()),name=new TextEncoder().encode(file.name.replace(/[\\/]/g,'_')),crc=crc32(data);
  const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);header.set(name,30);
  const entry=new Uint8Array(46+name.length),c=new DataView(entry.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);entry.set(name,46);
  local.push(header.buffer,file.blob);central.push(entry.buffer);offset+=header.length+data.length;centralSize+=entry.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
 return new Blob([...local,...central,end.buffer],{type:'application/zip'});
}
