export const MAX_FILE=80*1024*1024;
export function validMedia(bytes: Uint8Array) {
  const s = new TextDecoder('latin1').decode(bytes.slice(0, 16));
  return (bytes[0] === 0xff && (bytes[1] === 0xd8 || (bytes[1] & 0xe0) === 0xe0)) || s.startsWith('\x89PNG') || s.startsWith('GIF8') || s.slice(4, 8) === 'ftyp' || s.startsWith('RIFF') || s.startsWith('ID3') || s.startsWith('OggS') || s.startsWith('fLaC') || (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3);
}
