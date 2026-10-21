import prisma from './prisma';
import type { AuditLog } from '@prisma/client';

export interface AuditInput {
  userId?: string | null;
  teacherId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(input: AuditInput): Promise<AuditLog | null> {
  try {
    return await prisma.auditLog.create({
      data: {
        userId: input.userId || null,
        teacherId: input.teacherId || null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        details: input.details ? (input.details as unknown as object) : undefined,
        ipAddress: input.ipAddress || null,
      },
    });
  } catch (err) {
    console.error('[Audit] 写入审计日志失败:', err);
    return null;
  }
}

export const AuditActions = {
  USER_LOGIN: 'USER_LOGIN',
  USER_REGISTER: 'USER_REGISTER',
  TEACHER_CREATE: 'TEACHER_CREATE',
  TEACHER_UPDATE: 'TEACHER_UPDATE',
  TEACHER_TOGGLE_ONLINE: 'TEACHER_TOGGLE_ONLINE',
  TEACHER_APPROVE: 'TEACHER_APPROVE',
  TEACHER_REJECT: 'TEACHER_REJECT',
  SERVICE_CREATE: 'SERVICE_CREATE',
  SERVICE_UPDATE: 'SERVICE_UPDATE',
  SERVICE_DELETE: 'SERVICE_DELETE',
  MEDIA_UPLOAD: 'MEDIA_UPLOAD',
  MEDIA_TOGGLE_PUBLIC: 'MEDIA_TOGGLE_PUBLIC',
  MEDIA_MODERATE: 'MEDIA_MODERATE',
  BOOKING_CREATE: 'BOOKING_CREATE',
  BOOKING_CONFIRM: 'BOOKING_CONFIRM',
  BOOKING_CANCEL: 'BOOKING_CANCEL',
  BOOKING_COMPLETE: 'BOOKING_COMPLETE',
  REPORT_CREATE: 'REPORT_CREATE',
  REPORT_HANDLE: 'REPORT_HANDLE',
  USER_BAN: 'USER_BAN',
  USER_UNBAN: 'USER_UNBAN',
  SUBSCRIPTION_UPDATE: 'SUBSCRIPTION_UPDATE',
} as const;
