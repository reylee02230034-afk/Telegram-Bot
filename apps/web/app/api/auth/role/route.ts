import { NextResponse } from 'next/server';
import { getAuthFromRequest, signAuthCookies } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const roleSchema = z.object({
  role: z.enum(['STUDENT', 'TEACHER']),
});

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const parsed = roleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: '数据校验失败' }, { status: 400 });
  }
  const role = parsed.data.role;

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    include: { teacherProfile: true },
  });
  if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: '管理员无需选择身份' }, { status: 400 });
  }

  if (user.hasOnboarded && user.role !== role) {
    return NextResponse.json(
      { error: '身份已确定，如需切换请在机器人中发送 /switchrole' },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role, hasOnboarded: true },
    include: { teacherProfile: true },
  });

  await signAuthCookies({
    userId: updated.id,
    telegramId: updated.telegramId.toString(),
    role: updated.role as 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN',
    isTeacher: !!updated.teacherProfile,
    teacherId: updated.teacherProfile?.id,
  });

  return NextResponse.json({
    ok: true,
    role: updated.role,
    hasOnboarded: updated.hasOnboarded,
    isTeacher: !!updated.teacherProfile,
  });
}
