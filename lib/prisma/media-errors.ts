function errorText(error:unknown):string {
 if(typeof error==='string')return error.trim();
 if(error&&typeof error==='object'&&'message' in error&&typeof error.message==='string')return error.message.trim();
 return '';
}

export class EngineStartupError extends Error {
 constructor(message:string){super(message);this.name='EngineStartupError';}
}
export function isEngineStartupError(error:unknown):error is EngineStartupError {
 return error instanceof Error&&error.name==='EngineStartupError';
}
export class EngineCommandError extends Error {
 constructor(message:string,public accelerated:boolean){super(message);this.name='EngineCommandError';}
}
export function isEngineCommandError(error:unknown):error is EngineCommandError {
 return error instanceof Error&&error.name==='EngineCommandError';
}

// Worker errors arrive as strings, not Error instances.
export function isFatalMediaError(error:unknown):boolean {
 return /memory access out of bounds|out of memory|\boom\b|Aborted\(|unreachable|table index is out of bounds/i.test(errorText(error));
}

export function mediaErrorMessage(error:unknown,fallback='Não foi possível processar a mídia. Tente novamente.'):string {
 if(isFatalMediaError(error))return 'O motor de mídia encontrou uma falha interna. Tente novamente; ele será recarregado automaticamente.';
 const message=errorText(error);
 if(/called FFmpeg\.terminate|AbortError|operation was aborted/i.test(message))return 'Operação cancelada.';
 return message.slice(0,500)||fallback;
}
