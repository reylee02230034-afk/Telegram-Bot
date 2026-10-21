'use client';

import { useEffect, useState } from 'react';

interface TeacherDetail {
  id: string;
  displayName: string;
  bio: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  subjects: string | null;
  priceInfo: string | null;
  coverPhotoUrl: string | null;
  homepageUrl: string | null;
  avatarUrl: string | null;
  username: string | null;
  telegramId: string;
  isOnline: boolean;
  media: { id: string; type: string; url: string; thumbnailUrl: string | null }[];
}

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { id } = await params;
      try {
        const res = await fetch(`/api/teachers/${id}`);
        const data = await res.json();
        if (!data.ok) {
          setError(data.error || '老师不存在');
        } else {
          setTeacher(data.teacher);
        }
      } catch {
        setError('加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>;
  if (error) return <div style={{ padding: 24, textAlign: 'center', color: '#ef4444' }}>{error}</div>;
  if (!teacher) return null;

  const telegramLink = `tg://user?id=${teacher.telegramId}`;

  const hasAnyInfo = teacher.age || teacher.heightCm || teacher.weightKg;
  const subjectList = teacher.subjects
    ? teacher.subjects.split(/[，,、/\s]+/).filter(Boolean)
    : [];

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}>
      <div style={{
        background: teacher.coverPhotoUrl
          ? `linear-gradient(135deg, rgba(51,144,236,0.75), rgba(29,78,216,0.85)), url(${teacher.coverPhotoUrl}) center/cover no-repeat`
          : 'linear-gradient(135deg, #3390ec 0%, #1d4ed8 100%)',
        padding: 'calc(env(safe-area-inset-top) + 12px) 16px 60px',
        color: 'white',
        position: 'relative',
      }}>
        <a href="/maps" style={{
          position: 'absolute', left: 14, top: 'calc(env(safe-area-inset-top) + 12px)',
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 18, textDecoration: 'none',
        }}>←</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 40 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: '#1d4ed8',
            overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', flexShrink: 0,
          }}>
            {teacher.avatarUrl ? (
              <img src={teacher.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : teacher.displayName.slice(0, 1)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{teacher.displayName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: teacher.isOnline ? '#22c55e' : '#94a3b8' }} />
              <span style={{ fontSize: 13, opacity: 0.9 }}>
                {teacher.isOnline ? '🟢 在线上课中' : '🔴 休息中'}
              </span>
            </div>
            {teacher.username && (
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>@{teacher.username}</div>
            )}
          </div>
        </div>

        {subjectList.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {subjectList.map((s, i) => (
              <span key={i} style={{
                padding: '4px 12px', background: 'rgba(255,255,255,0.25)',
                borderRadius: 14, fontSize: 12, fontWeight: 500,
                backdropFilter: 'blur(4px)',
              }}>🎯 {s}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '0 16px', marginTop: -40 }}>
        {hasAnyInfo && (
          <div style={{
            background: 'white', borderRadius: 12, padding: 16, marginBottom: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-around',
          }}>
            {teacher.age != null && (
              <StatItem icon="🎂" label="年龄" value={`${teacher.age}岁`} />
            )}
            {teacher.heightCm != null && (
              <StatItem icon="📏" label="身高" value={`${teacher.heightCm}cm`} />
            )}
            {teacher.weightKg != null && (
              <StatItem icon="⚖️" label="体重" value={`${teacher.weightKg}kg`} />
            )}
          </div>
        )}

        {teacher.priceInfo && (
          <div style={{
            background: 'white', borderRadius: 12, padding: 16, marginBottom: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>💰 价格方案</div>
            <div style={{ fontSize: 15, color: '#1e293b', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {teacher.priceInfo}
            </div>
          </div>
        )}

        {teacher.bio && (
          <div style={{
            background: 'white', borderRadius: 12, padding: 16, marginBottom: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>📝 个人简介</div>
            <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {teacher.bio}
            </div>
          </div>
        )}

        {teacher.homepageUrl && (
          <div style={{
            background: 'white', borderRadius: 12, padding: 16, marginBottom: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>🔗 主页</div>
            <a href={teacher.homepageUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 14, color: '#3390ec', wordBreak: 'break-all' }}>
              {teacher.homepageUrl}
            </a>
          </div>
        )}

        {teacher.media.length > 0 && (
          <div style={{
            background: 'white', borderRadius: 12, padding: 16, marginBottom: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
              📸 作品展示 ({teacher.media.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {teacher.media.map((m, i) => (
                <div key={m.id} onClick={() => setPreviewIdx(i)}
                  style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#f1f5f9' }}>
                  {m.type === 'VIDEO' ? (
                    <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                  ) : (
                    <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {previewIdx !== null && (
        <div onClick={() => setPreviewIdx(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {teacher.media[previewIdx].type === 'VIDEO' ? (
            <video src={teacher.media[previewIdx].url} controls autoPlay
              style={{ maxWidth: '95vw', maxHeight: '90vh' }} />
          ) : (
            <img src={teacher.media[previewIdx].url}
              style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain' }} alt="" />
          )}
          <div onClick={(e) => { e.stopPropagation(); setPreviewIdx(null); }}
            style={{ position: 'absolute', top: 20, right: 20, color: 'white', fontSize: 24, cursor: 'pointer', background: 'rgba(255,255,255,0.2)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ✕
          </div>
        </div>
      )}

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '12px 16px calc(env(safe-area-inset-bottom) + 12px)',
        background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(10px)',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.08)', display: 'flex', gap: 12, zIndex: 100,
      }}>
        <a href={telegramLink} style={{
          flex: 1,
          background: 'linear-gradient(135deg, #3390ec 0%, #1d4ed8 100%)',
          color: 'white', border: 'none', borderRadius: 24, padding: '14px 20px',
          fontSize: 15, fontWeight: 700, textAlign: 'center', textDecoration: 'none',
          boxShadow: '0 4px 14px rgba(51,144,236,0.35)',
        }}>💬 和老师沟通</a>
      </div>
    </div>
  );
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{label}</div>
    </div>
  );
}
