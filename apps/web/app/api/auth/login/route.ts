import { NextResponse } from 'next/server';
import { signAuthCookies } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { verifyTelegramInitData } from '@/lib/telegram';
import { rateLimiters, checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getClientIp(req: Request): string {
  const xfwd = req.headers.get('x-forwarded-for');
  if (xfwd) return xfwd.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'anonymous';
}

const loginSchema = z.object({
  initData: z.string().min(1).optional(),
  telegramId: z.string().min(1),
  firstName: z.string().optional(),
  username: z.string().optional(),
  role: z.enum(['STUDENT', 'TEACHER']).optional(),
  dev: z.boolean().optional(),
});

export async function POST(req: Request) {
  const clientIp = getClientIp(req);
  const rl = await checkRateLimit(rateLimiters.auth, clientIp);
  if (!rl.ok) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfter)) } }
    );
  }

  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '数据校验失败' }, { status: 400 });
  }
  const { initData, telegramId, firstName, username, role, dev } = parsed.data;

  const isDevMode = dev && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_LOGIN === 'true');

  if (!isDevMode && initData) {
    const valid = verifyTelegramInitData(initData);
    if (!valid) {
      return NextResponse.json({ error: 'Telegram initData 验证失败' }, { status: 401 });
    }
  }

  let user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    include: { teacherProfile: true },
  });

  const isAdmin = process.env.ADMIN_TELEGRAM_IDS?.split(',').includes(telegramId);

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId: BigInt(telegramId),
        firstName: firstName || null,
        username: username || null,
        role: isAdmin ? 'ADMIN' : (role || 'STUDENT'),
        hasOnboarded: !!role || isAdmin,
      },
      include: { teacherProfile: true },
    });
  } else {
    if (firstName && firstName !== user.firstName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { firstName, username: username ?? user.username },
        include: { teacherProfile: true },
      });
    }
  }

  if (isAdmin && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' },
      include: { teacherProfile: true },
    });
  }

  const token = await signAuthCookies({
    userId: user.id,
    telegramId: user.telegramId.toString(),
    role: user.role as 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN',
    isTeacher: !!user.teacherProfile,
    teacherId: user.teacherProfile?.id,
  });

  return NextResponse.json({
    ok: true,
    token,
    user: {
      id: user.id,
      role: user.role,
      hasOnboarded: user.hasOnboarded,
      isTeacher: !!user.teacherProfile,
      teacherProfile: user.teacherProfile
        ? {
            id: user.teacherProfile.id,
            displayName: user.teacherProfile.displayName,
            isOnline: user.teacherProfile.isOnline,
            approvalStatus: user.teacherProfile.approvalStatus,
          }
        : null,
    },
  });
}
