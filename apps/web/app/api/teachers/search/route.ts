import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fuzzyCoordinate(val: number, jitterKm: number = 0.5): number {
  const jitter = jitterKm / 111;
  const offset = (Math.random() - 0.5) * jitter * 2;
  return Math.round((val + offset) * 100) / 100;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get('lat') || '');
  const lon = parseFloat(searchParams.get('lon') || '');
  const radiusKm = parseFloat(searchParams.get('radius') || '10');

  const teachers = await prisma.teacherProfile.findMany({
    where: { isOnline: true, approvalStatus: 'APPROVED' },
    include: { user: { select: { username: true, firstName: true, avatarUrl: true } } },
  });

  let results = teachers.map((t) => {
    const distance = lat && lon ? haversineDistance(lat, lon, t.latitude, t.longitude) : null;
    return {
      id: t.id,
      displayName: t.displayName,
      bio: t.bio,
      priceInfo: t.priceInfo,
      avatarUrl: t.user.avatarUrl,
      username: t.user.username,
      isOnline: t.isOnline,
      latitude: fuzzyCoordinate(t.latitude),
      longitude: fuzzyCoordinate(t.longitude),
      distanceKm: distance !== null ? Math.round(distance * 10) / 10 : null,
    };
  });

  if (lat && lon) {
    results = results
      .filter((r) => (r.distanceKm ?? Infinity) <= radiusKm)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  return NextResponse.json({ ok: true, total: results.length, teachers: results });
}
