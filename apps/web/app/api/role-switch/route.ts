import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  requestedRole: z.enum(['STUDENT', 'TEACHER']),
  reason: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['STUDENT', 'TEACHER'])(auth);
  } catch {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '数据校验失败' }, { status: 400 });
  }

  if (parsed.data.requestedRole === auth!.role) {
    return NextResponse.json({ error: '您已经是该身份' }, { status: 400 });
  }

  const pendingExists = await prisma.roleSwitchRequest.findFirst({
    where: { userId: auth!.userId, status: 'PENDING' },
  });
  if (pendingExists) {
    return NextResponse.json({ error: '您已有待审核的申请' }, { status: 400 });
  }

  const request = await prisma.roleSwitchRequest.create({
    data: {
      userId: auth!.userId,
      requestedRole: parsed.data.requestedRole,
      reason: parsed.data.reason || null,
    },
  });

  return NextResponse.json({ ok: true, request });
}
