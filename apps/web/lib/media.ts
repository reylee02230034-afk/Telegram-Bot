import { writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
const MEDIA_MAX_SIZE_MB = parseInt(process.env.MEDIA_MAX_SIZE_MB || '10', 10);
const MEDIA_MAX_SIZE_BYTES = MEDIA_MAX_SIZE_MB * 1024 * 1024;
const STORAGE_PATH = process.env.MEDIA_LOCAL_PATH || './storage/uploads';

export interface MediaValidationResult {
  ok: boolean;
  error?: string;
  mediaType?: 'IMAGE' | 'VIDEO';
  fileExt?: string;
}

export function validateMediaFile(
  mimeType: string,
  sizeBytes: number
): MediaValidationResult {
  if (sizeBytes <= 0) {
    return { ok: false, error: '文件不能为空' };
  }
  if (sizeBytes > MEDIA_MAX_SIZE_BYTES) {
    return { ok: false, error: `文件超过 ${MEDIA_MAX_SIZE_MB}MB 限制` };
  }

  if (ALLOWED_IMAGE_MIMES.includes(mimeType)) {
    const ext = mimeType.split('/')[1].replace('jpeg', 'jpg');
    return { ok: true, mediaType: 'IMAGE', fileExt: ext };
  }
  if (ALLOWED_VIDEO_MIMES.includes(mimeType)) {
    const ext = mimeType.split('/')[1].replace('quicktime', 'mov');
    return { ok: true, mediaType: 'VIDEO', fileExt: ext };
  }

  return { ok: false, error: `不支持的文件类型: ${mimeType}` };
}

export async function saveMediaFile(
  buffer: Buffer,
  mimeType: string,
  providerId: string,
  fileExt: string
): Promise<{ url: string; fileSize: number; storageKey: string }> {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const year = new Date().getFullYear().toString();
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const dir = path.join(STORAGE_PATH, providerId, year, month);
  const filename = `${hash}.${fileExt}`;
  const fullPath = path.join(dir, filename);

  await mkdir(dir, { recursive: true });
  await writeFile(fullPath, buffer);

  const storageKey = `${providerId}/${year}/${month}/${filename}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/media/${storageKey}`;

  return { url, fileSize: buffer.length, storageKey };
}

export interface ContentModerationResult {
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  note?: string;
}

export async function moderateContent(
  _storageKey: string,
  _mimeType: string
): Promise<ContentModerationResult> {
  const provider = process.env.CONTENT_MODERATION || 'mock';
  if (provider === 'mock') {
    return { status: 'APPROVED' };
  }
  return { status: 'PENDING' };
}

export async function mediaFileExists(storageKey: string): Promise<boolean> {
  try {
    const fullPath = path.join(STORAGE_PATH, storageKey);
    const s = await stat(fullPath);
    return s.isFile();
  } catch {
    return false;
  }
}
