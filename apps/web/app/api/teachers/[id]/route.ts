import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id },
    include: {
      user: { select: { username: true, firstName: true, avatarUrl: true, telegramId: true } },
      media: { where: { moderationStatus: 'APPROVED' }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!teacher) return NextResponse.json({ error: '老师不存在' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    teacher: {
      id: teacher.id,
      displayName: teacher.displayName,
      bio: teacher.bio,
      age: teacher.age,
      heightCm: teacher.heightCm,
      weightKg: teacher.weightKg,
      subjects: teacher.subjects,
      priceInfo: teacher.priceInfo,
      coverPhotoUrl: teacher.coverPhotoUrl,
      homepageUrl: teacher.homepageUrl,
      avatarUrl: teacher.user.avatarUrl,
      username: teacher.user.username,
      telegramId: teacher.user.telegramId.toString(),
      isOnline: teacher.isOnline,
      approvalStatus: teacher.approvalStatus,
      latitude: teacher.latitude,
      longitude: teacher.longitude,
      lastLocationAt: teacher.lastLocationAt,
      media: teacher.media.map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
      })),
    },
  });
}
