'use client';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '@/lib/supabase/useAuth';

type Aglomerado = { id: string; centro_lat: number; centro_lng: number; qtd_execucoes: number; raio_metros: number };

export function MapaAglomerados() {
  const { token } = useAuth();
  const [dados, setDados] = useState<Aglomerado[]>([]);
  const [carregando, setCarregando] = useState(false);

  function carregar() {
    if (!token) return;
    fetch('/api/aglomerados', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setDados(d.aglomerados ?? []));
  }

  useEffect(carregar, [token]);

  async function recalcular() {
    if (!token) return;
    setCarregando(true);
    const res = await fetch('/api/aglomerados/recalc', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setDados(data.aglomerados ?? []);
    setCarregando(false);
  }

  const centro: [number, number] = dados.length
    ? [dados.reduce((s, a) => s + a.centro_lat, 0) / dados.length, dados.reduce((s, a) => s + a.centro_lng, 0) / dados.length]
    : [-4.225, -44.779]; // fallback: região de Bacabal-MA

  return (
    <div>
      <div className="card" style={{ marginBottom: 10 }}>
        <strong>{dados.length} aglomerado(s) detectado(s)</strong>
        <span className="hint" style={{ marginLeft: 8 }}>
          Proximidade geográfica é só análise — nunca remove ou marca execuções como duplicadas.
        </span>
        <button className="secondary" onClick={recalcular} disabled={carregando} style={{ float: 'right' }}>
          {carregando ? 'Recalculando…' : 'Recalcular aglomerados'}
        </button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <MapContainer center={centro} zoom={dados.length ? 13 : 11} style={{ height: 520, width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {dados.map(a => (
            <CircleMarker
              key={a.id}
              center={[a.centro_lat, a.centro_lng]}
              radius={Math.min(6 + a.qtd_execucoes, 24)}
              pathOptions={{ color: '#ea580c', fillColor: '#ea580c', fillOpacity: 0.5 }}
            >
              <Popup>
                <b>{a.qtd_execucoes} execuções</b> nesse mesmo ponto<br />
                lat {a.centro_lat.toFixed(6)}, lng {a.centro_lng.toFixed(6)}<br />
                raio de agrupamento: ~{a.raio_metros}m
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
