import { createHash } from 'crypto';
import { ExecucaoNormalizada } from '../types';

/**
 * CHAVE DE DUPLICIDADE: gera o unique_hash (SHA-256) a partir dos campos
 * configurados (ex.: instalacao + data_real + nota_leitura). A chave é
 * configurável — troque `campos` conforme a estrutura da base.
 */
export function gerarUniqueHash(
  dados: ExecucaoNormalizada,
  campos: (keyof ExecucaoNormalizada)[]
): string {
  const valores = campos.map(c => {
    const v = (dados as any)[c];
    return v === null || v === undefined ? '' : String(v).trim().toUpperCase();
  });
  return createHash('sha256').update(valores.join('|')).digest('hex');
}

export function algumCampoChaveVazio(
  dados: ExecucaoNormalizada,
  campos: (keyof ExecucaoNormalizada)[]
): boolean {
  return campos.some(c => {
    const v = (dados as any)[c];
    return v === null || v === undefined || String(v).trim() === '';
  });
}
