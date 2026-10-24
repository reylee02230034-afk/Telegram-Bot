import { NextResponse } from 'next/server';
import { AUTH_COOKIE_OPTIONS, createToken, getAuthFromRequest } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' };

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: '未登录' }, { status: 401, headers: NO_STORE });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    include: {
      teacherProfile: {
        include: {
          media: {
            where: { moderationStatus: 'APPROVED' },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404, headers: NO_STORE });

  console.log(
    `[auth/me] userId=${user.id} tokenRole=${auth.role} dbRole=${user.role} isTeacher=${!!user.teacherProfile}`
  );

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      username: user.username,
      hasOnboarded: user.hasOnboarded,
      isTeacher: !!user.teacherProfile,
      teacherProfile: user.teacherProfile
        ? {
            id: user.teacherProfile.id,
            displayName: user.teacherProfile.displayName,
            bio: user.teacherProfile.bio,
            age: user.teacherProfile.age,
            hometown: user.teacherProfile.hometown,
            heightCm: user.teacherProfile.heightCm,
            weightKg: user.teacherProfile.weightKg,
            bust: user.teacherProfile.bust,
            subjects: user.teacherProfile.subjects,
            priceInfo: user.teacherProfile.priceInfo,
            coverPhotoUrl: user.teacherProfile.coverPhotoUrl,
            homepageUrl: user.teacherProfile.homepageUrl,
            isOnline: user.teacherProfile.isOnline,
            approvalStatus: user.teacherProfile.approvalStatus,
            lastLocationAt: user.teacherProfile.lastLocationAt,
            media: user.teacherProfile.media.map((m) => ({
              id: m.id,
              type: m.type,
              url: m.url,
              thumbnailUrl: m.thumbnailUrl,
            })),
          }
        : null,
    },
  }, { headers: NO_STORE });

  // token 与数据库角色不一致时重新签发 cookie（直接写入响应，确保 Set-Cookie 生效）
  if (auth.role !== user.role || auth.isTeacher !== !!user.teacherProfile) {
    const token = await createToken({
      userId: user.id,
      telegramId: user.telegramId.toString(),
      role: user.role as 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN',
      isTeacher: !!user.teacherProfile,
      teacherId: user.teacherProfile?.id,
    });
    res.cookies.set('auth_token', token, AUTH_COOKIE_OPTIONS);
  }

  return res;
}
