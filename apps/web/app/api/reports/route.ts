import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { logAudit, AuditActions } from '@/lib/audit';
import { rateLimiters, checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  targetType: z.enum(['TEACHER', 'BOOKING', 'USER', 'MEDIA']),
  targetId: z.string(),
  reason: z.string().min(2).max(200),
  description: z.string().max(1000).optional().nullable(),
});

export async function POST(req: Request) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rl = await checkRateLimit(rateLimiters.report, `report:${clientIp}`);
  if (!rl.ok) {
    return NextResponse.json({ error: '举报过于频繁' }, { status: 429 });
  }

  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['STUDENT', 'TEACHER', 'ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '数据校验失败', details: parsed.error.flatten() }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      reporterId: auth!.userId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
      description: parsed.data.description || null,
    },
  });

  await logAudit({
    userId: auth!.userId,
    action: AuditActions.REPORT_CREATE,
    entityType: 'REPORT',
    entityId: report.id,
    details: { targetType: parsed.data.targetType, targetId: parsed.data.targetId },
    ipAddress: clientIp,
  });

  return NextResponse.json({ ok: true, report });
}
