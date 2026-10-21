function encodeGeohash(latitude: number, longitude: number, precision: number): string {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latRange = [-90.0, 90.0];
  let lonRange = [-180.0, 180.0];
  let isEven = true;
  let bit = 0;
  let ch = 0;
  let hash = '';

  while (hash.length < precision) {
    if (isEven) {
      const mid = (lonRange[0] + lonRange[1]) / 2;
      if (longitude >= mid) {
        ch |= 1 << (4 - bit);
        lonRange[0] = mid;
      } else {
        lonRange[1] = mid;
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (latitude >= mid) {
        ch |= 1 << (4 - bit);
        latRange[0] = mid;
      } else {
        latRange[1] = mid;
      }
    }
    isEven = !isEven;
    bit++;
    if (bit === 5) {
      hash += base32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

function decodeGeohash(hash: string): { lat: number; lon: number } {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latRange = [-90.0, 90.0];
  let lonRange = [-180.0, 180.0];
  let isEven = true;

  for (const char of hash) {
    const bits = base32.indexOf(char);
    for (let i = 4; i >= 0; i--) {
      const bit = (bits >> i) & 1;
      if (isEven) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        if (bit) lonRange[0] = mid;
        else lonRange[1] = mid;
      } else {
        const mid = (latRange[0] + latRange[1]) / 2;
        if (bit) latRange[0] = mid;
        else latRange[1] = mid;
      }
      isEven = !isEven;
    }
  }

  return {
    lat: (latRange[0] + latRange[1]) / 2,
    lon: (lonRange[0] + lonRange[1]) / 2,
  };
}

const GEOSIZE = [
  [5009400, 4992000],
  [1252350, 624100],
  [156543, 155520],
  [39136, 19440],
  [4892, 4860],
  [1223, 607.5],
  [152.9, 151.9],
  [38.2, 38.0],
  [4.77, 4.75],
  [1.19, 1.19],
];

export function geohashPrecisionMeters(precision: number): number {
  if (precision < 1 || precision > 10) return 0;
  return Math.max(GEOSIZE[precision - 1][0], GEOSIZE[precision - 1][1]);
}

export function computeGeohashes(lat: number, lon: number): { geohash4: string; geohash5: string } {
  return {
    geohash4: encodeGeohash(lat, lon, 4),
    geohash5: encodeGeohash(lat, lon, 5),
  };
}

export function haversineDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getNeighbors(geohash: string): string[] {
  const { lat, lon } = decodeGeohash(geohash);
  const precision = geohash.length;
  const latStep = geohashPrecisionMeters(precision) / 111000;
  const lonStep = geohashPrecisionMeters(precision) / (111000 * Math.cos(lat * Math.PI / 180));

  const deltas: [number, number][] = [
    [0, 1],    // n
    [1, 1],    // ne
    [1, 0],    // e
    [1, -1],   // se
    [0, -1],   // s
    [-1, -1],  // sw
    [-1, 0],   // w
    [-1, 1],   // nw
  ];

  return deltas.map(([dx, dy]) =>
    encodeGeohash(lat + dx * latStep, lon + dy * lonStep, precision)
  );
}

export function obfuscateLocation(lat: number, lon: number, precision: number): { lat: number; lon: number } {
  const hash = encodeGeohash(lat, lon, precision);
  const center = decodeGeohash(hash);

  const jitterLat = (Math.random() - 0.5) * geohashPrecisionMeters(precision) / 111000;
  const jitterLon = (Math.random() - 0.5) * geohashPrecisionMeters(precision) / (111000 * Math.cos(center.lat * Math.PI / 180));

  return {
    lat: center.lat + jitterLat,
    lon: center.lon + jitterLon,
  };
}

export function expandGeohashRing(centerHash: string, ring: number): string[] {
  const all = new Set<string>();
  all.add(centerHash);

  const queue: { hash: string; dist: number }[] = [{ hash: centerHash, dist: 0 }];
  const visited = new Set([centerHash]);

  while (queue.length > 0) {
    const { hash, dist } = queue.shift()!;
    if (dist >= ring) continue;
    for (const neighbor of getNeighbors(hash)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        all.add(neighbor);
        queue.push({ hash: neighbor, dist: dist + 1 });
      }
    }
  }

  return Array.from(all);
}

export { encodeGeohash, decodeGeohash };
