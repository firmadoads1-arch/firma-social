'use client';

import {useEffect, useState, type FormEvent} from 'react';

type Connection = {port: number; token: string};
type CycleState = {
  date: string;
  selected: number;
  cycle: {status: string; target: number; planned: number} | null;
};
const labels: Record<string, string> = {
  running: 'Em execução', paused: 'Pausado', interrupted: 'Interrompido',
  completed: 'Planejamento concluído', canceled: 'Cancelado',
};

async function getCycle(connection: Connection, start = false): Promise<CycleState> {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${connection.port}/api/firma/cycle`, {
      method: start ? 'POST' : 'GET',
      headers: {'X-Firma-Cycle-Key': connection.token},
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('Abra o Ciclo Local no mesmo computador deste navegador e permita o acesso à rede local, se solicitado.');
  }
  if (!response.ok) {
    const failure = await response.json() as {error?: string};
    throw new Error(failure.error ?? 'Falha na comunicação com o Ciclo Local.');
  }
  return await response.json() as CycleState;
}

export default function CicloLocal() {
  const [code, setCode] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [state, setState] = useState<CycleState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connect(event: FormEvent) {
    event.preventDefault();
    const match = /^(\d{1,5}):([a-f0-9]{64})$/.exec(code.trim());
    const port = Number(match?.[1]);
    if (!match || port < 1 || port > 65535) {
      setError('Copie o código completo exibido no Ciclo Local.');
      return;
    }
    const next = {port, token: match[2]};
    setBusy(true);
    setError('');
    try {
      setState(await getCycle(next));
      setConnection(next);
      setCode('');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function update(start = false) {
    if (!connection) return;
    setBusy(true);
    setError('');
    try {
      setState(await getCycle(connection, start));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const running = state?.cycle?.status === 'running';
  useEffect(() => {
    if (!connection || !running || busy) return;
    let active = true;
    const timer = window.setTimeout(() => {
      getCycle(connection).then(next => {
        if (active) setState(next);
      }).catch(cause => {
        if (active) setError(cause.message);
      });
    }, 2000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [connection, state, running, busy]);

  return <section className="panel" aria-label="Ciclo Local no Windows">
    <h2>Ciclo diário de 10 posições</h2>
    <p className="muted">O serviço do Windows gera as posições e guarda os relatórios. Selecione as origens Gmail no painel local antes de iniciar.</p>
    {!connection ? <form onSubmit={connect} className="form-stack">
      <p>No computador que roda o Ciclo Local, abra o programa pelo <strong>iniciar.bat</strong>. Em <strong>Firma Social</strong>, clique em <strong>Mostrar código de conexão</strong> e cole o código aqui.</p>
      <label htmlFor="ciclo-pairing">Código de conexão</label>
      <input id="ciclo-pairing" type="password" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} required />
      <div><button type="submit" className="button primary" disabled={busy}>{busy ? 'Conectando…' : 'Conectar ao Windows'}</button></div>
    </form> : <>
      <p role="status">{state?.cycle
        ? `${labels[state.cycle.status] ?? state.cycle.status} · ${state.cycle.planned} de ${state.cycle.target} posições planejadas`
        : 'Nenhum ciclo iniciado hoje.'}</p>
      <p className="muted">{state?.date?.split('-').reverse().join('/')} · {state?.selected} origens selecionadas · Horário de São Paulo</p>
      <div className="heading-actions">
        <button className="button primary" disabled={busy || !!state?.cycle || !state?.selected} onClick={() => update(true)}>Gerar ciclo de hoje</button>
        <button className="button" disabled={busy} onClick={() => update()}>Atualizar</button>
        <a className="button" href={`http://127.0.0.1:${connection.port}/`} target="_blank" rel="noreferrer">Abrir painel do Windows</a>
        <button className="button" disabled={busy} onClick={() => {setConnection(null); setState(null); setError('');}}>Desconectar</button>
      </div>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
