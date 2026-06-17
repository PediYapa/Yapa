/**
 * Roteamento por geolocalização — núcleo determinístico e puro (testável,
 * sem banco). Dado o ponto do cliente, escolhe a distribuidora ATIVA mais
 * próxima cujo raio de atuação cobre o cliente.
 */

export type Ponto = { latitude: number | null; longitude: number | null };

export type DistribuidoraGeo = {
  id: string;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  raio_km: number;
  ativo: boolean;
};

/** Distância em km entre dois pontos (fórmula de Haversine). */
export function haversineKm(a: Ponto, b: Ponto): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return null;
  }
  const R = 6371; // raio da Terra em km
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export type ResultadoRoteamento = {
  distribuidora: DistribuidoraGeo;
  distancia_km: number;
} | null;

/**
 * Escolhe a distribuidora ideal para um cliente:
 *  - apenas ativas e com coordenadas;
 *  - cliente precisa estar dentro do raio_km da distribuidora;
 *  - entre as elegíveis, a mais próxima.
 * Retorna null se nenhuma cobre o cliente (cair em fila manual).
 */
export function escolherDistribuidora(
  cliente: Ponto,
  distribuidoras: DistribuidoraGeo[],
): ResultadoRoteamento {
  let melhor: ResultadoRoteamento = null;
  for (const d of distribuidoras) {
    if (!d.ativo) continue;
    const dist = haversineKm(cliente, d);
    if (dist == null) continue;
    if (dist > d.raio_km) continue;
    if (!melhor || dist < melhor.distancia_km) {
      melhor = { distribuidora: d, distancia_km: dist };
    }
  }
  return melhor;
}
