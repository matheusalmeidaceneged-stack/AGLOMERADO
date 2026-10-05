'use client';
import { useCallback, useEffect, useState } from 'react';

const CHAVE = 'cnl_mes_filtro'; // '' = todos os meses, ou 'YYYY-MM'
const EVENTO = 'cnl-mes-filtro-mudou';

export function useMesFiltro() {
  const [mes, setMesState] = useState('');
  useEffect(() => {
    setMesState(localStorage.getItem(CHAVE) ?? '');
    const onMudou = () => setMesState(localStorage.getItem(CHAVE) ?? '');
    window.addEventListener(EVENTO, onMudou);
    return () => window.removeEventListener(EVENTO, onMudou);
  }, []);
  const setMes = useCallback((novo: string) => {
    localStorage.setItem(CHAVE, novo);
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  const range = mesParaRange(mes);
  return { mes, setMes, mesDe: range?.de ?? null, mesAte: range?.ate ?? null };
}

export function mesParaRange(mes: string): { de: string; ate: string } | null {
  if (!mes) return null;
  const [y, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(y, m, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimoDia).padStart(2, '0')}` };
}

export function labelDoMes(valor: string): string {
  const [y, m] = valor.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Busca, no banco, só os meses que realmente têm execuções com Data Prevista. */
export function useMesesDisponiveis(token: string | null) {
  const [meses, setMeses] = useState<string[]>([]);
  useEffect(() => {
    if (!token) return;
    fetch('/api/meses-disponiveis', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setMeses(d.meses ?? []))
      .catch(() => setMeses([]));
  }, [token]);
  return meses;
}

// anexa mes_de/mes_ate a um URLSearchParams já existente, se houver filtro ativo
export function aplicarMesEmParams(p: URLSearchParams, mesDe: string | null, mesAte: string | null) {
  if (mesDe && mesAte) { p.set('mes_de', mesDe); p.set('mes_ate', mesAte); }
  return p;
}
