import { ExecucaoNormalizada, MAPA_COLUNAS } from '../types';

function toIsoDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // aceita "dd/mm/aaaa" ou serial do Excel já convertido pelo parser (cellDates:true)
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * VALIDAÇÃO DAS COLUNAS: garante que os cabeçalhos essenciais existem.
 */
export function validarColunas(headers: string[]): { ok: boolean; faltando: string[] } {
  const obrigatorias = ['Instalação'];
  const faltando = obrigatorias.filter(c => !headers.includes(c));
  return { ok: faltando.length === 0, faltando };
}

/**
 * NORMALIZAÇÃO DOS DADOS: converte uma linha bruta (objeto header->valor)
 * no formato padronizado usado no restante do pipeline.
 */
export function normalizarLinha(raw: Record<string, unknown>): ExecucaoNormalizada {
  const out: any = {
    instalacao: '', usuario: null, unidade_leitura: null, tipo: null,
    nota_leitura: null, descricao_nota: null, data_prevista: null,
    data_real: null, hora: null, envio: null, retorno: null,
    lat_envio: null, lng_envio: null, lat_retorno: null, lng_retorno: null,
    raw_data: raw,
  };
  for (const [coluna, campo] of Object.entries(MAPA_COLUNAS)) {
    const valor = raw[coluna];
    if (campo === 'instalacao') out.instalacao = toText(valor) ?? '';
    else if (campo === 'data_prevista' || campo === 'data_real') out[campo] = toIsoDate(valor);
    else if (campo === 'lat_envio' || campo === 'lng_envio' || campo === 'lat_retorno' || campo === 'lng_retorno')
      out[campo] = toNumber(valor);
    else out[campo] = toText(valor);
  }
  return out as ExecucaoNormalizada;
}

/**
 * VALIDAÇÃO DE COORDENADAS: latitude entre -90/90, longitude entre -180/180.
 * Coordenadas ausentes não são erro (nem toda execução tem retorno em campo);
 * coordenadas presentes e fora do intervalo válido, sim.
 */
export function coordenadasValidas(n: ExecucaoNormalizada): boolean {
  const pares: [number | null, number | null][] = [
    [n.lat_envio, n.lng_envio],
    [n.lat_retorno, n.lng_retorno],
  ];
  for (const [lat, lng] of pares) {
    if (lat === null && lng === null) continue;
    if (lat === null || lng === null) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  }
  return true;
}
