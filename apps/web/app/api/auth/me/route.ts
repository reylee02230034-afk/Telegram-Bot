import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: '未登录' }, { status: 401 });

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

  if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

  return NextResponse.json({
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
            heightCm: user.teacherProfile.heightCm,
            weightKg: user.teacherProfile.weightKg,
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
  });
}
