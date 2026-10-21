import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthFromRequest(_req);
  try {
    requireRole(['TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const media = await prisma.teacherMedia.findUnique({
    where: { id },
    include: { teacher: true },
  });
  if (!media) return NextResponse.json({ error: '媒体不存在' }, { status: 404 });

  if (media.teacher.userId !== auth!.userId && auth!.role !== 'ADMIN' && auth!.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: '无权限删除' }, { status: 403 });
  }

  await prisma.teacherMedia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
