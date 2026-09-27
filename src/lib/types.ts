export type StatusLinha = 'NOVO' | 'DUPLICADO_ARQUIVO' | 'JA_EXISTE' | 'ERRO';

export interface ExecucaoNormalizada {
  instalacao: string;
  usuario: string | null;
  unidade_leitura: string | null;
  tipo: string | null;
  nota_leitura: string | null;
  descricao_nota: string | null;
  data_prevista: string | null; // ISO date
  data_real: string | null;     // ISO date
  hora: string | null;
  envio: string | null;
  retorno: string | null;
  lat_envio: number | null;
  lng_envio: number | null;
  lat_retorno: number | null;
  lng_retorno: number | null;
  raw_data: Record<string, unknown>;
}

export interface LinhaProcessada {
  linha: number;
  dados: ExecucaoNormalizada;
  unique_hash: string;
  status: StatusLinha;
  motivo_erro?: string;
}

export interface ResumoImportacao {
  total: number;
  novos: number;
  duplicados_arquivo: number;
  ja_existentes: number;
  erros: number;
}

// Mapeamento das colunas esperadas na planilha (ver CNL_MES.XLSX) para os
// campos normalizados. Ajuste aqui se a estrutura da base mudar.
export const MAPA_COLUNAS: Record<string, keyof ExecucaoNormalizada | 'instalacao'> = {
  'Usuário': 'usuario',
  'Data Prevista': 'data_prevista',
  'Unid. Leitura': 'unidade_leitura',
  'Instalação': 'instalacao',
  'Tp.': 'tipo',
  'Nt.Lt': 'nota_leitura',
  'Descrição Nota de Leitura': 'descricao_nota',
  'Data Real': 'data_real',
  'Hora': 'hora',
  'Envio': 'envio',
  'Retorno': 'retorno',
  'Latitude Enio': 'lat_envio',
  'Longitude Envio': 'lng_envio',
  'Latitude Retorno': 'lat_retorno',
  'Longitude Retorno': 'lng_retorno',
};

export const CAMPOS_CHAVE_PADRAO: (keyof ExecucaoNormalizada)[] = [
  'instalacao', 'data_real', 'nota_leitura',
] as (keyof ExecucaoNormalizada)[];
