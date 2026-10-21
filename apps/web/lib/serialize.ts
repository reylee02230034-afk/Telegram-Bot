export function toJSON<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Date) return v.toISOString();
      if (v instanceof Map) return Object.fromEntries(v);
      if (v instanceof Set) return Array.from(v);
      return v;
    })
  ) as T;
}

export function serializeMedia(m: {
  id: string;
  type: string;
  url: string;
  fileSizeBytes: bigint | number;
  mime: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  isPublic: boolean;
  consentGranted: boolean;
  moderationStatus: string;
  moderationNote?: string | null;
  uploadedAt: Date;
}) {
  return {
    id: m.id,
    type: m.type,
    url: m.url,
    fileSizeBytes: typeof m.fileSizeBytes === 'bigint' ? Number(m.fileSizeBytes) : m.fileSizeBytes,
    mime: m.mime,
    width: m.width,
    height: m.height,
    durationSec: m.durationSec,
    isPublic: m.isPublic,
    consentGranted: m.consentGranted,
    moderationStatus: m.moderationStatus,
    moderationNote: m.moderationNote,
    uploadedAt: m.uploadedAt.toISOString(),
  };
}
