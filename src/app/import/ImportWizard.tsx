'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/supabase/useAuth';

const CAMPOS_DISPONIVEIS: { campo: string; label: string }[] = [
  { campo: 'instalacao', label: 'Instalação' },
  { campo: 'data_real', label: 'Data Real' },
  { campo: 'data_prevista', label: 'Data Prevista' },
  { campo: 'nota_leitura', label: 'Nota de Leitura' },
  { campo: 'tipo', label: 'Tipo' },
  { campo: 'unidade_leitura', label: 'Unid. Leitura' },
  { campo: 'usuario', label: 'Usuário/Agente' },
];
const PADRAO = ['instalacao', 'data_real', 'nota_leitura'];
const CHUNK_SIZE = 1000;

type Linha = { linha: number; dados: any; unique_hash: string; status: string; motivo_erro?: string };

export function ImportWizard() {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [chave, setChave] = useState<string[]>(PADRAO);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [resumo, setResumo] = useState<any>(null);
  const [linhasPreview, setLinhasPreview] = useState<Linha[]>([]);
  const [filtro, setFiltro] = useState('ALL');
  const [fase, setFase] = useState<'upload' | 'chave' | 'preview' | 'confirmando' | 'concluido'>('upload');
  const [progresso, setProgresso] = useState(0);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [previewCarregando, setPreviewCarregando] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f); setErroGeral(null);
    const XLSX = await import('xlsx');
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    setRows(data);
    setHeaders(data.length ? Object.keys(data[0]) : []);
    setFase('chave');
  }

  function toggleChave(campo: string) {
    setChave(c => c.includes(campo) ? c.filter(x => x !== campo) : [...c, campo]);
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  async function preVisualizar() {
    if (!file || chave.length === 0) return;
    setErroGeral(null); setPreviewCarregando(true); setProgresso(0);
    try {
      const startRes = await fetch('/api/import/start', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ nome_arquivo: file.name, chave_duplicidade: chave, total_registros: rows.length }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error);
      setImportacaoId(startData.importacao_id);

      const acumulado = { total: 0, novos: 0, duplicados_arquivo: 0, ja_existentes: 0, erros: 0 };
      const todasLinhas: Linha[] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const bloco = rows.slice(i, i + CHUNK_SIZE).map((raw, j) => ({ linha: i + j + 2, raw }));
        const res = await fetch('/api/import/chunk', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ importacao_id: startData.importacao_id, chave_duplicidade: chave, dry_run: true, linhas: bloco }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        for (const k of Object.keys(acumulado)) (acumulado as any)[k] += data.resumo[k];
        todasLinhas.push(...data.linhas);
        setProgresso(Math.min(100, Math.round(((i + bloco.length) / rows.length) * 100)));
      }
      setResumo(acumulado);
      setLinhasPreview(todasLinhas);
      setFase('preview');
    } catch (e: any) {
      setErroGeral(e.message ?? 'erro ao pré-visualizar');
    } finally {
      setPreviewCarregando(false);
    }
  }

  async function confirmarImportacao() {
    if (!importacaoId) return;
    setFase('confirmando'); setProgresso(0); setErroGeral(null);
    try {
      const acumulado = { total: 0, novos: 0, duplicados_arquivo: 0, ja_existentes: 0, erros: 0 };
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const bloco = rows.slice(i, i + CHUNK_SIZE).map((raw, j) => ({ linha: i + j + 2, raw }));
        const res = await fetch('/api/import/chunk', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ importacao_id: importacaoId, chave_duplicidade: chave, dry_run: false, linhas: bloco }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        for (const k of Object.keys(acumulado)) (acumulado as any)[k] += data.resumo[k];
        setProgresso(Math.min(100, Math.round(((i + bloco.length) / rows.length) * 100)));
      }
      await fetch('/api/import/finish', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ importacao_id: importacaoId, status: 'concluida' }),
      });
      setResumo(acumulado);
      setFase('concluido');
    } catch (e: any) {
      setErroGeral(e.message ?? 'erro ao importar');
      setFase('preview');
    }
  }

  function baixarNovosCsv() {
    const novos = linhasPreview.filter(l => l.status === 'NOVO');
    const cols = ['instalacao', 'data_real', 'nota_leitura', 'tipo', 'unidade_leitura', 'usuario'];
    const csv = [cols.join(';'), ...novos.map(n => cols.map(c => n.dados[c] ?? '').join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'registros_novos.csv'; a.click();
  }

  const listaFiltrada = (filtro === 'ALL' ? linhasPreview : linhasPreview.filter(l => l.status === filtro)).slice(0, 300);

  return (
    <div>
      <h2>Importar planilha</h2>
      {erroGeral && <div className="card" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{erroGeral}</div>}

      <div className="card">
        <strong>1. Selecione o arquivo (.xlsx, .xls, .csv)</strong>
        <div style={{ marginTop: 10 }}><input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} /></div>
        {file && <div className="hint">{rows.length} registros lidos, {headers.length} colunas.</div>}
      </div>

      {fase !== 'upload' && (
        <div className="card">
          <strong>2. Chave de duplicidade</strong> <span className="hint">— campos que juntos identificam um registro único</span>
          <div className="cols">
            {CAMPOS_DISPONIVEIS.map(c => (
              <div key={c.campo} className={`chip ${chave.includes(c.campo) ? 'on' : ''}`} onClick={() => toggleChave(c.campo)}>{c.label}</div>
            ))}
          </div>
          <button className="primary" disabled={chave.length === 0 || previewCarregando} onClick={preVisualizar}>
            {previewCarregando ? 'Analisando…' : 'Pré-visualizar importação'}
          </button>
          {previewCarregando && (
            <div className="progress" style={{ marginTop: 10 }}><div style={{ width: `${progresso}%` }} /></div>
          )}
        </div>
      )}

      {resumo && (fase === 'preview' || fase === 'concluido') && (
        <div className="card">
          <strong>3. Resumo</strong>
          <div className="summary" style={{ marginTop: 10 }}>
            <div className="stat"><b>{resumo.total}</b>No arquivo</div>
            <div className="stat novo"><b>{resumo.novos}</b>Novos</div>
            <div className="stat dup"><b>{resumo.duplicados_arquivo}</b>Duplicados no arquivo</div>
            <div className="stat exist"><b>{resumo.ja_existentes}</b>Já existentes</div>
            <div className="stat err"><b>{resumo.erros}</b>Com erro</div>
          </div>
          {fase === 'preview' && (
            <>
              <button className="primary" onClick={confirmarImportacao}>Confirmar e importar {resumo.novos} novos</button>
              <button className="secondary" onClick={baixarNovosCsv}>Baixar novos (CSV)</button>
            </>
          )}
          {fase === 'concluido' && <div className="hint" style={{ marginTop: 8 }}>Importação concluída e registrada no histórico.</div>}
        </div>
      )}

      {fase === 'confirmando' && (
        <div className="card">
          <strong>Processando importação...</strong>
          <div className="progress" style={{ marginTop: 10 }}><div style={{ width: `${progresso}%` }} /></div>
          <div className="hint">{progresso}%</div>
        </div>
      )}

      {linhasPreview.length > 0 && fase !== 'confirmando' && (
        <div className="card">
          <strong>4. Prévia dos registros</strong>
          <div className="cols">
            {[['ALL', 'Todos'], ['NOVO', '🟢 Novos'], ['DUPLICADO_ARQUIVO', '🟠 Duplicados'], ['JA_EXISTE', '🟡 Já existentes'], ['ERRO', '🔴 Erros']].map(([k, l]) => (
              <button key={k} className="secondary" onClick={() => setFiltro(k)}>{l}</button>
            ))}
          </div>
          <div className="tblwrap" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Linha</th><th>Instalação</th><th>Data Real</th><th>Nota</th><th>Status</th></tr></thead>
              <tbody>
                {listaFiltrada.map(l => (
                  <tr key={l.linha}>
                    <td>{l.linha}</td><td>{l.dados.instalacao}</td><td>{l.dados.data_real ?? '-'}</td><td>{l.dados.nota_leitura ?? '-'}</td>
                    <td><span className={`badge b-${l.status === 'NOVO' ? 'novo' : l.status === 'DUPLICADO_ARQUIVO' ? 'dup' : l.status === 'JA_EXISTE' ? 'exist' : 'err'}`}>{l.status.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint">Mostrando {listaFiltrada.length} de {(filtro === 'ALL' ? linhasPreview : linhasPreview.filter(l => l.status === filtro)).length} registro(s).</div>
        </div>
      )}
    </div>
  );
}
