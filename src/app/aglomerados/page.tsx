'use client';
import dynamic from 'next/dynamic';

const MapaAglomerados = dynamic(() => import('./MapaAglomerados').then(m => m.MapaAglomerados), { ssr: false });

export default function AglomeradosPage() {
  return <MapaAglomerados />;
}
