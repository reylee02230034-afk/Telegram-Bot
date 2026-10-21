import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch (err: any) {
    ok = false;
    checks.db = `fail: ${err?.message || 'unknown'}`;
  }

  return NextResponse.json(
    { ok, ...checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  );
}
