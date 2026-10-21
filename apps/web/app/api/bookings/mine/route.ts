import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const url = new URL(req.url);
  const asTeacher = url.searchParams.get('as') === 'teacher';
  const status = url.searchParams.get('status');

  const where: any = {};

  if (asTeacher) {
    const profile = await prisma.teacherProfile.findUnique({ where: { userId: auth!.userId } });
    if (!profile) return NextResponse.json({ ok: true, bookings: [] });
    where.teacherId = profile.id;
  } else {
    where.studentId = auth!.userId;
  }

  if (status) where.status = status;

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      teacher: { select: { id: true, displayName: true, priceInfo: true } },
      student: { select: { id: true, firstName: true, username: true } },
    },
    orderBy: { scheduledAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ ok: true, bookings });
}
