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

// ignora maiúsculas/minúsculas e espaços extras ao comparar nomes de coluna,
// para pequenas variações na planilha (espaço a mais, caixa diferente) não
// derrubarem a importação inteira.
function normalizarCabecalho(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

const MAPA_NORMALIZADO = new Map<string, keyof ExecucaoNormalizada | 'instalacao'>();
for (const [coluna, campo] of Object.entries(MAPA_COLUNAS)) {
  MAPA_NORMALIZADO.set(normalizarCabecalho(coluna), campo);
}
const CABECALHOS_CONHECIDOS = new Set(Object.keys(MAPA_COLUNAS).map(normalizarCabecalho));

/**
 * VALIDAÇÃO DAS COLUNAS: garante que os cabeçalhos essenciais existem (com
 * a mesma tolerância a maiúsculas/espaços usada na normalização) e avisa
 * quais colunas da planilha não foram reconhecidas por nenhum campo, para
 * facilitar diagnosticar uma planilha com cabeçalho diferente do esperado.
 */
export function validarColunas(headers: string[]): { ok: boolean; faltando: string[]; naoReconhecidas: string[] } {
  const normalizados = headers.map(normalizarCabecalho);
  const obrigatorias = ['Instalação'];
  const faltando = obrigatorias.filter(c => !normalizados.includes(normalizarCabecalho(c)));
  const naoReconhecidas = headers.filter((h, i) => !CABECALHOS_CONHECIDOS.has(normalizados[i]));
  return { ok: faltando.length === 0, faltando, naoReconhecidas };
}

/**
 * NORMALIZAÇÃO DOS DADOS: converte uma linha bruta (objeto header->valor)
 * no formato padronizado usado no restante do pipeline. Casa cada coluna da
 * planilha com o campo correspondente via MAPA_NORMALIZADO (tolerante a
 * maiúsculas/espaços e a variações de grafia já cadastradas em MAPA_COLUNAS).
 */
export function normalizarLinha(raw: Record<string, unknown>): ExecucaoNormalizada {
  const out: any = {
    instalacao: '', usuario: null, unidade_leitura: null, tipo: null,
    nota_leitura: null, descricao_nota: null, data_prevista: null,
    data_real: null, hora: null, envio: null, retorno: null,
    lat_envio: null, lng_envio: null, lat_retorno: null, lng_retorno: null,
    raw_data: raw,
  };
  for (const [colunaRaw, valor] of Object.entries(raw)) {
    const campo = MAPA_NORMALIZADO.get(normalizarCabecalho(colunaRaw));
    if (!campo) continue;
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
