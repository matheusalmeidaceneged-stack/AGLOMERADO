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

// opções de mês para o seletor: de 18 meses atrás até 2 meses à frente
export function opcoesDeMes(): { valor: string; label: string }[] {
  const hoje = new Date();
  const out: { valor: string; label: string }[] = [];
  for (let i = -18; i <= 2; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    out.push({ valor, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return out.reverse();
}

// anexa mes_de/mes_ate a um URLSearchParams já existente, se houver filtro ativo
export function aplicarMesEmParams(p: URLSearchParams, mesDe: string | null, mesAte: string | null) {
  if (mesDe && mesAte) { p.set('mes_de', mesDe); p.set('mes_ate', mesAte); }
  return p;
}
