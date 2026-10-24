'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import MapInner from '@/components/MapInner';

export const dynamic = 'force-dynamic';

interface TgWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
}

function getTelegramWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { Telegram?: { WebApp?: TgWebApp } };
  return w.Telegram?.WebApp || null;
}

async function ensureAuth(): Promise<boolean> {
  const tg = getTelegramWebApp();
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const meRes = await fetch('/api/auth/me', { credentials: 'include' });
  if (meRes.ok) return true;

  const body: any = {};
  if (tg?.initData) {
    const params = new URLSearchParams(tg.initData);
    const userJson = params.get('user');
    body.initData = tg.initData;
    if (userJson) {
      try {
        const u = JSON.parse(userJson);
        body.telegramId = String(u.id);
        body.firstName = u.first_name || '';
        body.username = u.username || '';
      } catch {}
    }
  } else {
    body.dev = true;
    body.telegramId = '100000001';
    body.firstName = '访客';
  }

  const loginRes = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  return loginRes.ok;
}

function LoadingSpinner() {
  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: 'linear-gradient(180deg, #f0f7ff 0%, #e6f0ff 100%)',
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        border: '3px solid #dbeafe',
        borderTopColor: '#3390ec',
        animation: 'spin 0.9s linear infinite',
      }} />
      <div style={{ fontSize: 15, color: '#475569', fontWeight: 500 }}>正在定位身边的老师...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorView({ msg, onRetry }: { msg: string; onRetry?: () => void }) {
  return (
    <div style={{
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 24,
      textAlign: 'center',
      background: '#f8fafc',
    }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <div style={{ fontSize: 16, color: '#1e293b', fontWeight: 600 }}>哎呀，出错了</div>
      <div style={{ fontSize: 14, color: '#64748b', maxWidth: 300 }}>{msg}</div>
      {onRetry && (
        <button onClick={onRetry} style={{
          padding: '10px 24px',
          background: '#3390ec',
          color: 'white',
          border: 'none',
          borderRadius: 20,
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}>重试</button>
      )}
    </div>
  );
}

export default function MapsPage() {
  const [user, setUser] = useState<any>(null);
  const [center, setCenter] = useState<[number, number]>([39.9123, 116.4567]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selfPos, setSelfPos] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [heatmapPoints, setHeatmapPoints] = useState<{ lng: number; lat: number; count: number }[]>([]);

  const getMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  }, []);

  const locate = useCallback((): Promise<[number, number]> => {
    return new Promise((resolve) => {
      const fallback: [number, number] = [39.9123, 116.4567];
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        resolve(fallback);
        return;
      }
      let done = false;
      const finish = (v: [number, number]) => {
        if (!done) { done = true; resolve(v); }
      };
      const timer = setTimeout(() => finish(fallback), 2500);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); finish([pos.coords.latitude, pos.coords.longitude]); },
        () => { clearTimeout(timer); finish(fallback); },
        { enableHighAccuracy: false, timeout: 2000, maximumAge: 60000 }
      );
    });
  }, []);

  const loadTeachers = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/teachers/search?lat=${lat}&lon=${lon}&radius=500`);
      const data = await res.json();
      if (data.ok) {
        setTeachers(data.teachers.map((t: any) => ({
          id: t.id, displayName: t.displayName, avatarUrl: t.avatarUrl,
          username: t.username, latitude: t.latitude, longitude: t.longitude,
          distanceKm: t.distanceKm, isOnline: true,
        })));
      }
    } catch {}
  }, []);

  const subscribeSSE = useCallback(() => {
    const es = new EventSource('/api/teachers/online');
    es.addEventListener('snapshot', (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data);
        if (parsed.teachers) {
          setTeachers(parsed.teachers.map((t: any) => ({
            id: t.id, displayName: t.displayName, avatarUrl: t.avatarUrl,
            username: t.username, latitude: t.latitude, longitude: t.longitude,
            isOnline: true,
          })));
        }
      } catch {}
    });
    es.addEventListener('teacher_online', (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data);
        if (parsed.teacher) {
          setTeachers((prev) => prev.some((t) => t.id === parsed.teacher.id) ? prev : [...prev, {
            id: parsed.teacher.id, displayName: parsed.teacher.displayName || '老师',
            avatarUrl: parsed.teacher.avatarUrl, username: parsed.teacher.username,
            latitude: parsed.teacher.latitude, longitude: parsed.teacher.longitude, isOnline: true,
          }]);
        }
      } catch {}
    });
    es.addEventListener('teacher_offline', (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data);
        if (parsed.teacherId) setTeachers((prev) => prev.filter((t) => t.id !== parsed.teacherId));
      } catch {}
    });
    return () => es.close();
  }, []);

  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      setLoading(true);
      try {
        const authed = await ensureAuth();
        if (!authed) { setError('请通过 Telegram 机器人打开此页面'); setLoading(false); return; }
        const me = await getMe();
        if (!me) { setError('用户信息加载失败，请重新打开'); setLoading(false); return; }
        setUser(me);
        const pos = await locate();
        setCenter(pos);
        setSelfPos(pos);
        setLoading(false);
        if (me.role === 'STUDENT') {
          loadTeachers(pos[0], pos[1]);
          subscribeSSE();
        }
      } catch (err: any) {
        setError(err?.message || '加载失败');
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user || !selfPos || user.role !== 'STUDENT') return;
    let cancelled = false;
    const report = async () => {
      if (cancelled) return;
      try {
        await fetch('/api/students/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: selfPos[0], longitude: selfPos[1] }),
          credentials: 'include',
        });
      } catch {}
    };
    report();
    const timer = setInterval(report, 60000);
    const onUnload = () => {
      navigator.sendBeacon('/api/students/presence', JSON.stringify({ _method: 'DELETE' }));
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('beforeunload', onUnload);
      fetch('/api/students/presence', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    };
  }, [user, selfPos]);

  useEffect(() => {
    if (!user || user.role !== 'TEACHER') { setHeatmapPoints([]); return; }
    let cancelled = false;
    const fetchHeatmap = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/students/online', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.points) {
          setHeatmapPoints(data.points.map((p: any) => ({ lng: p.lng, lat: p.lat, count: p.count })));
        }
      } catch {}
    };
    fetchHeatmap();
    const timer = setInterval(fetchHeatmap, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user]);

  const toggleOnline = async () => {
    if (!user?.teacherProfile?.id || toggling) return;
    setToggling(true);
    const newOnline = !user.teacherProfile.isOnline;
    const pos = selfPos || center;
    try {
      const res = await fetch(`/api/teachers/${user.teacherProfile.id}/toggle-online`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ online: newOnline, lat: pos[0], lon: pos[1] }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) {
        setUser((prev: any) => ({ ...prev, teacherProfile: { ...prev.teacherProfile, isOnline: newOnline } }));
        if (newOnline && user.role === 'TEACHER') {
          loadTeachers(pos[0], pos[1]);
          subscribeSSE();
        }
      }
    } finally {
      setToggling(false);
    }
  };

  const refreshLocation = async () => {
    const pos = await locate();
    setCenter(pos);
    setSelfPos(pos);
    if (user?.role === 'STUDENT') loadTeachers(pos[0], pos[1]);
  };

  const handleMarkerClick = (id: string) => {
    if (user?.teacherProfile?.id === id) return;
    window.location.href = `/teachers/${id}`;
  };

  const selfMarker: any | null =
    user?.teacherProfile && (selfPos || user.teacherProfile.latitude)
      ? { id: 'self', displayName: '我',
          latitude: selfPos ? selfPos[0] : user.teacherProfile.latitude,
          longitude: selfPos ? selfPos[1] : user.teacherProfile.longitude,
          isSelf: true, isOnline: user.teacherProfile.isOnline }
      : selfPos ? { id: 'self', displayName: '我', latitude: selfPos[0], longitude: selfPos[1], isSelf: true }
      : null;

  const mapTeachers = selfMarker ? [...teachers, selfMarker] : teachers;

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorView msg={error} />;

  const isTeacher = user?.role === 'TEACHER';
  const isOnline = user?.teacherProfile?.isOnline;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 10px) 14px 10px',
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        zIndex: 500,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
            {isTeacher ? '👨‍🏫 老师地图' : '🎓 找老师'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={refreshLocation} style={styles.iconBtn} title="刷新定位">
              📍
            </button>
            {isTeacher && user?.teacherProfile && (
              <button
                onClick={toggleOnline}
                disabled={toggling}
                style={{
                  ...styles.toggleBtn,
                  background: isOnline ? '#ef4444' : '#22c55e',
                  opacity: toggling ? 0.6 : 1,
                }}
              >
                {toggling ? '⏳' : isOnline ? '⏸️ 下课' : '▶️ 上课'}
              </button>
            )}
          </div>
        </div>

        <div style={{ fontSize: 12, marginTop: 8, color: '#64748b' }}>
          {isTeacher
            ? <span style={{ color: isOnline ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {isOnline ? '🟢 上课中，学生能看到你' : '🔴 休息中，学生看不到你'}
                {heatmapPoints.length > 0 && (
                  <span style={{ color: '#f97316', marginLeft: 8 }}>
                    · 🔥 {heatmapPoints.length} 个学生热点
                  </span>
                )}
              </span>
            : `🟢 当前有 ${teachers.length} 位在线老师`}
          {isTeacher && (
            <a href="/teacher/edit" style={{ float: 'right', fontSize: 12, color: '#3390ec', textDecoration: 'none', fontWeight: 500 }}>
              ✏️ 编辑资料
            </a>
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapInner
          center={center}
          teachers={mapTeachers}
          onMarkerClick={handleMarkerClick}
          heatmapPoints={heatmapPoints}
          showHeatmap={isTeacher}
        />
      </div>

      <div style={{
        padding: '10px 14px calc(env(safe-area-inset-bottom) + 10px)',
        background: 'rgba(255,255,255,0.95)',
        borderTop: '1px solid #f1f5f9',
        fontSize: 12, color: '#94a3b8', textAlign: 'center',
      }}>
        坐标已模糊化 ±500m · 保护老师隐私
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  iconBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#f1f5f9', border: 'none', borderRadius: '50%', cursor: 'pointer', fontSize: 16,
  },
  toggleBtn: {
    padding: '8px 18px', color: 'white', border: 'none', borderRadius: 20,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
};
