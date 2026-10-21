import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { encodeGeohash } from '@/lib/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_WINDOW_MINUTES = 3;

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MINUTES * 60 * 1000);

  await prisma.studentPresence.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });

  const presences = await prisma.studentPresence.findMany({
    where: { lastSeenAt: { gte: cutoff } },
    select: { latitude: true, longitude: true },
  });

  const aggregated = new Map<string, { latSum: number; lonSum: number; count: number }>();
  for (const p of presences) {
    const hash4 = encodeGeohash(p.latitude, p.longitude, 4);
    const existing = aggregated.get(hash4) || { latSum: 0, lonSum: 0, count: 0 };
    existing.latSum += p.latitude;
    existing.lonSum += p.longitude;
    existing.count++;
    aggregated.set(hash4, existing);
  }

  const points = Array.from(aggregated.values()).map((v) => ({
    lat: Math.round((v.latSum / v.count) * 1000) / 1000,
    lon: Math.round((v.lonSum / v.count) * 1000) / 1000,
    count: v.count,
  }));

  points.sort((a, b) => b.count - a.count);

  const maxCount = points.length > 0 ? Math.max(...points.map((p) => p.count)) : 1;

  return NextResponse.json({
    ok: true,
    total: presences.length,
    clusters: points.length,
    maxCount,
    points: points.map((p) => ({
      lng: p.lon,
      lat: p.lat,
      count: p.count,
    })),
  });
}

