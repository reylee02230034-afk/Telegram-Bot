import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit, AuditActions } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action, resolution } = body as { action: 'resolve' | 'dismiss' | 'investigate'; resolution?: string };

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: '举报不存在' }, { status: 404 });

  const statusMap = {
    resolve: 'RESOLVED',
    dismiss: 'DISMISSED',
    investigate: 'INVESTIGATING',
  } as const;

  const updated = await prisma.report.update({
    where: { id },
    data: {
      status: statusMap[action],
      handledById: auth!.userId,
      handledAt: new Date(),
      resolution: resolution || null,
    },
  });

  await logAudit({
    userId: auth!.userId,
    action: AuditActions.REPORT_HANDLE,
    entityType: 'REPORT',
    entityId: id,
    details: { action, previousStatus: report.status, newStatus: updated.status },
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0] || undefined,
  });

  if (action === 'resolve' && report.targetType === 'TEACHER') {
    await prisma.teacherProfile.update({
      where: { id: report.targetId },
      data: { isOnline: false, onlineSince: null },
    });
  }

  return NextResponse.json({ ok: true, report: updated });
}
