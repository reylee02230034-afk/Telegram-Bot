const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encode(lat: number, lon: number, precision: number): string {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let isEven = true;
  let bit = 0;
  let ch = 0;
  let hash = '';

  while (hash.length < precision) {
    if (isEven) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch |= 1 << (4 - bit);
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }

    isEven = !isEven;
    bit++;

    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return hash;
}

export function encodeGeohash(lat: number, lon: number, precision: number = 5): string {
  if (precision < 1 || precision > 12) {
    throw new Error('Geohash precision must be between 1 and 12');
  }
  return encode(lat, lon, precision);
}
