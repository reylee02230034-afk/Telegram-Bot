import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { encodeGeohash } from '@/lib/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const profileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(1000).optional().nullable(),
  age: z.number().min(1).max(99).optional().nullable(),
  hometown: z.string().max(60).optional().nullable(),
  heightCm: z.number().min(100).max(250).optional().nullable(),
  weightKg: z.number().min(30).max(200).optional().nullable(),
  bust: z.string().max(20).optional().nullable(),
  subjects: z.string().max(200).optional().nullable(),
  priceInfo: z.string().max(300).optional().nullable(),
  coverPhotoUrl: z.string().url().max(500).optional().nullable(),
  homepageUrl: z.string().url().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole('TEACHER')(auth);
  } catch {
    return NextResponse.json({ error: '仅老师可更新资料' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '数据校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.teacherProfile.findUnique({ where: { userId: auth!.userId } });

  if (existing) {
    const updateData: any = { ...parsed.data };
    if (parsed.data.latitude !== undefined && parsed.data.longitude !== undefined) {
      updateData.geohash5 = encodeGeohash(parsed.data.latitude, parsed.data.longitude, 5);
      updateData.geohash4 = encodeGeohash(parsed.data.latitude, parsed.data.longitude, 4);
      updateData.lastLocationAt = new Date();
    }
    const updated = await prisma.teacherProfile.update({
      where: { id: existing.id },
      data: updateData,
    });
    return NextResponse.json({ ok: true, teacher: updated });
  }

  if (parsed.data.latitude === undefined || parsed.data.longitude === undefined) {
    return NextResponse.json({ error: '首次创建需要位置信息' }, { status: 400 });
  }

  const created = await prisma.teacherProfile.create({
    data: {
      userId: auth!.userId,
      displayName: parsed.data.displayName || '未命名老师',
      bio: parsed.data.bio ?? null,
      age: parsed.data.age ?? null,
      hometown: parsed.data.hometown ?? null,
      heightCm: parsed.data.heightCm ?? null,
      weightKg: parsed.data.weightKg ?? null,
      bust: parsed.data.bust ?? null,
      subjects: parsed.data.subjects ?? null,
      priceInfo: parsed.data.priceInfo ?? null,
      coverPhotoUrl: parsed.data.coverPhotoUrl ?? null,
      homepageUrl: parsed.data.homepageUrl ?? null,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      geohash5: encodeGeohash(parsed.data.latitude, parsed.data.longitude, 5),
      geohash4: encodeGeohash(parsed.data.latitude, parsed.data.longitude, 4),
      lastLocationAt: new Date(),
      approvalStatus: 'APPROVED',
    },
  });

  await prisma.user.update({
    where: { id: auth!.userId },
    data: { role: 'TEACHER', hasOnboarded: true },
  });

  return NextResponse.json({ ok: true, teacher: created });
}
