import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '数据校验失败' }, { status: 400 });

  const request = await prisma.roleSwitchRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: '申请不存在' }, { status: 404 });
  if (request.status !== 'PENDING') {
    return NextResponse.json({ error: '申请已处理' }, { status: 400 });
  }

  const approved = parsed.data.action === 'approve';

  if (approved) {
    await prisma.user.update({
      where: { id: request.userId },
      data: { role: request.requestedRole, hasOnboarded: true },
    });
    if (request.requestedRole === 'STUDENT') {
      await prisma.teacherProfile.deleteMany({ where: { userId: request.userId } });
    }
  }

  const updated = await prisma.roleSwitchRequest.update({
    where: { id },
    data: {
      status: approved ? 'APPROVED' : 'REJECTED',
      handledById: auth!.userId,
      handledAt: new Date(),
      handledNote: parsed.data.note || null,
    },
  });

  return NextResponse.json({ ok: true, request: updated });
}
