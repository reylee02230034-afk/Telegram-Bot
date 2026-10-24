import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { encodeGeohash } from '@/lib/geo';
import { triggerOnlineChange } from '@/lib/online-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const body = await req.json();
  const { online, lat, lon } = body;

  const teacher = await prisma.teacherProfile.findUnique({ where: { id } });
  if (!teacher) return NextResponse.json({ error: '老师不存在' }, { status: 404 });

  if (teacher.userId !== auth!.userId && auth!.role !== 'ADMIN' && auth!.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: '无权限操作' }, { status: 403 });
  }

  const wasOffline = !teacher.isOnline;

  const updateData: any = { isOnline: !!online };
  if (online) {
    updateData.onlineSince = new Date();
    if ((lat !== undefined && lat !== null) && (lon !== undefined && lon !== null)) {
      updateData.latitude = lat;
      updateData.longitude = lon;
      updateData.geohash5 = encodeGeohash(lat, lon, 5);
      updateData.geohash4 = encodeGeohash(lat, lon, 4);
      updateData.lastLocationAt = new Date();
    } else if (wasOffline) {
      updateData.lastLocationAt = new Date();
    }
  } else {
    updateData.onlineSince = null;
  }

  const updated = await prisma.teacherProfile.update({
    where: { id },
    data: updateData,
    include: { user: { select: { avatarUrl: true, username: true } } },
  });

  try {
    if (online) {
      triggerOnlineChange(id, true, {
        id,
        displayName: updated.displayName,
        bio: updated.bio,
        priceInfo: updated.priceInfo,
        latitude: Math.round((updated.latitude + (Math.random() - 0.5) * 0.009) * 100) / 100,
        longitude: Math.round((updated.longitude + (Math.random() - 0.5) * 0.009) * 100) / 100,
        avatarUrl: updated.user?.avatarUrl,
        username: updated.user?.username,
      });
    } else {
      triggerOnlineChange(id, false);
    }
  } catch {}

  return NextResponse.json({
    ok: true,
    teacher: { isOnline: updated.isOnline, onlineSince: updated.onlineSince },
  });
}
