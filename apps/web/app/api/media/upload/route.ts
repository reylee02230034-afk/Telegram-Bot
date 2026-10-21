import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { validateMediaFile, saveMediaFile } from '@/lib/media';
import { logAudit, AuditActions } from '@/lib/audit';
import { rateLimiters, checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await checkRateLimit(rateLimiters.mediaUpload, clientIp);
  if (!rl.ok) {
    return NextResponse.json({ error: `上传过于频繁，请 ${Math.ceil(rl.retryAfter)} 秒后重试` }, { status: 429 });
  }

  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '仅老师可上传媒体' }, { status: 403 });
  }

  const teacher = await prisma.teacherProfile.findUnique({ where: { userId: auth!.userId } });
  if (!teacher) return NextResponse.json({ error: '请先创建老师资料' }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const sortOrderStr = formData.get('sortOrder')?.toString() || '0';
  const sortOrder = parseInt(sortOrderStr, 10);

  if (!file) return NextResponse.json({ error: '缺少文件' }, { status: 400 });

  const validation = validateMediaFile(file.type, file.size);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { url, fileSize, storageKey } = await saveMediaFile(buffer, file.type, teacher.id, validation.fileExt!);

  const media = await prisma.teacherMedia.create({
    data: {
      teacherId: teacher.id,
      type: validation.mediaType!,
      url,
      fileSizeBytes: BigInt(fileSize),
      mime: file.type,
      width: null,
      height: null,
      durationSec: null,
      sortOrder,
      moderationStatus: 'APPROVED',
    },
  });

  await logAudit({
    userId: auth!.userId,
    teacherId: teacher.id,
    action: AuditActions.MEDIA_UPLOAD,
    entityType: 'MEDIA',
    entityId: media.id,
    details: { type: media.type },
    ipAddress: clientIp,
  });

  return NextResponse.json({
    ok: true,
    media: { ...media, fileSizeBytes: Number(media.fileSizeBytes) },
  });
}
