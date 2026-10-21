import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bookingSchema = z.object({
  teacherId: z.string().min(1),
  scheduledAt: z.string().refine((v) => new Date(v) > new Date(), '预约时间必须在未来'),
  price: z.coerce.number().min(0),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '数据校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const teacher = await prisma.teacherProfile.findUnique({ where: { id: parsed.data.teacherId } });
  if (!teacher) return NextResponse.json({ error: '老师不存在' }, { status: 404 });
  if (!teacher.isOnline) return NextResponse.json({ error: '老师当前不在线' }, { status: 400 });

  const booking = await prisma.booking.create({
    data: {
      studentId: auth!.userId,
      teacherId: teacher.id,
      scheduledAt: new Date(parsed.data.scheduledAt),
      price: parsed.data.price,
      notes: parsed.data.notes || null,
    },
  });

  return NextResponse.json({ ok: true, booking });
}
