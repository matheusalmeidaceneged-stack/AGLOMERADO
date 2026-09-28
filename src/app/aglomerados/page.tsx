'use client';
import dynamic from 'next/dynamic';

const MapaAglomerados = dynamic(() => import('./MapaAglomerados').then(m => m.MapaAglomerados), { ssr: false });

export default function AglomeradosPage() {
  return (
    <div>
      <h2>Aglomerados geográficos</h2>
      <MapaAglomerados />
    </div>
  );
}
