import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { encodeGeohash } from '@/lib/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const lat = typeof body.latitude === 'number' ? body.latitude : parseFloat(body.latitude);
  const lon = typeof body.longitude === 'number' ? body.longitude : parseFloat(body.longitude);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ ok: false, error: 'invalid coordinates' }, { status: 400 });
  }

  const geohash4 = encodeGeohash(lat, lon, 4);

  await prisma.studentPresence.upsert({
    where: { userId: auth!.userId },
    update: { latitude: lat, longitude: lon, geohash4, lastSeenAt: new Date() },
    create: { userId: auth!.userId, latitude: lat, longitude: lon, geohash4 },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  await prisma.studentPresence.deleteMany({ where: { userId: auth.userId } });
  return NextResponse.json({ ok: true });
}
