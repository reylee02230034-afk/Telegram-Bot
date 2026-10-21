import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { toJSON } from '@/lib/serialize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      teacher: { select: { id: true, displayName: true, priceInfo: true } },
      student: { select: { id: true, telegramId: true, username: true, firstName: true } },
    },
  });

  if (!booking) return NextResponse.json({ error: '预约不存在' }, { status: 404 });

  const isStudentOwner = booking.studentId === auth!.userId;
  const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: auth!.userId } });
  const isTeacherOwner = teacherProfile && booking.teacherId === teacherProfile.id;
  const isAdmin = auth!.role === 'ADMIN' || auth!.role === 'SUPER_ADMIN';

  if (!isStudentOwner && !isTeacherOwner && !isAdmin) {
    return NextResponse.json({ error: '无权限查看' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, booking: toJSON(booking) });
}
