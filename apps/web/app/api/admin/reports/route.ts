import { NextResponse } from 'next/server';
import { getAuthFromRequest, requireRole } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit, AuditActions } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req);
  try {
    requireRole(['ADMIN', 'SUPER_ADMIN'])(auth);
  } catch {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const targetType = url.searchParams.get('targetType');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (targetType) where.targetType = targetType;

  const reports = await prisma.report.findMany({
    where,
    include: { reporter: { select: { id: true, username: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });

  return NextResponse.json({ ok: true, reports });
}
