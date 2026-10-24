'use client';

import { useEffect, useState, useRef } from 'react';

interface TeacherData {
  displayName: string;
  bio: string | null;
  age: number | null;
  hometown: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bust: string | null;
  subjects: string | null;
  priceInfo: string | null;
  coverPhotoUrl: string | null;
  homepageUrl: string | null;
  media: { id: string; type: string; url: string }[];
}

interface PriceFields {
  single: string;
  double: string;
  overnight: string;
  other: string;
}

const EMPTY_PRICES: PriceFields = { single: '', double: '', overnight: '', other: '' };
const PRICE_LABELS: { key: keyof PriceFields; label: string; placeholder: string }[] = [
  { key: 'single', label: '一课价格', placeholder: '如 300元' },
  { key: 'double', label: '两课价格', placeholder: '如 550元' },
  { key: 'overnight', label: '包夜价格', placeholder: '如 1000元' },
  { key: 'other', label: '其它', placeholder: '如 路远加价 / 包月' },
];

function parsePrices(text: string | null): PriceFields {
  const result: PriceFields = { ...EMPTY_PRICES };
  if (!text) return result;
  text.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((line) => {
    const value = line.replace(/^.*?(一课|单课|单次|两课|双课|包夜|包时|其它|其他)[:：\s]*/, '').trim() || line;
    if (/一课|单课|单次/.test(line)) result.single = value;
    else if (/两课|双课|连报/.test(line)) result.double = value;
    else if (/包夜/.test(line)) result.overnight = value;
    else result.other = result.other ? `${result.other}；${line}` : line;
  });
  return result;
}

function serializePrices(prices: PriceFields): string | null {
  const lines: string[] = [];
  if (prices.single.trim()) lines.push(`一课 ${prices.single.trim()}`);
  if (prices.double.trim()) lines.push(`两课 ${prices.double.trim()}`);
  if (prices.overnight.trim()) lines.push(`包夜 ${prices.overnight.trim()}`);
  if (prices.other.trim()) lines.push(`其它 ${prices.other.trim()}`);
  return lines.length > 0 ? lines.join('\n') : null;
}

function composeBio(fields: {
  age: string; hometown: string; heightCm: string; weightKg: string; bust: string; subjects: string;
}): string | null {
  const parts: string[] = [];
  if (fields.age.trim()) parts.push(`${fields.age.trim()}岁`);
  if (fields.hometown.trim()) parts.push(fields.hometown.trim());
  if (fields.heightCm.trim()) parts.push(`${fields.heightCm.trim()}cm`);
  if (fields.weightKg.trim()) parts.push(`${fields.weightKg.trim()}kg`);
  if (fields.bust.trim()) parts.push(`胸围 ${fields.bust.trim()}`);
  if (fields.subjects.trim()) parts.push(`服务：${fields.subjects.trim()}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

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
  const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
  if (meRes.ok) return true;
  if (!tg || !tg.initData) return false;

  const params = new URLSearchParams(tg.initData);
  const userJson = params.get('user');
  let telegramId = '';
  let firstName = '';
  let username = '';
  if (userJson) {
    try {
      const u = JSON.parse(userJson);
      telegramId = String(u.id);
      firstName = u.first_name || '';
      username = u.username || '';
    } catch {}
  }

  const loginRes = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg.initData, telegramId, firstName, username }),
    credentials: 'include',
  });
  return loginRes.ok;
}

function getPosition(): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (v: [number, number] | null) => {
      if (!done) { done = true; resolve(v); }
    };
    const timer = setTimeout(() => finish(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); finish([pos.coords.latitude, pos.coords.longitude]); },
      () => { clearTimeout(timer); finish(null); },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 60000 }
    );
  });
}

export default function TeacherEditPage() {
  const [teacher, setTeacher] = useState<TeacherData | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [hometown, setHometown] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [bust, setBust] = useState('');
  const [subjects, setSubjects] = useState('');
  const [prices, setPrices] = useState<PriceFields>(EMPTY_PRICES);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      const authed = await ensureAuth();
      if (!authed) {
        setError('请通过 Telegram 机器人打开此页面');
        setLoading(false);
        return;
      }
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!data.ok || !data.user) {
        setError('用户信息加载失败，请重新打开');
        setLoading(false);
        return;
      }
      const me = data.user;
      const tp = me.teacherProfile;
      if (!tp) {
        if (me.role !== 'TEACHER') {
          setError('您还不是老师身份，请先在地图页选择「我是老师」');
          setLoading(false);
          return;
        }
        setIsNewProfile(true);
        setDisplayName(me.firstName || '');
        setLoading(false);
        return;
      }
      setTeacher({
        displayName: tp.displayName,
        bio: tp.bio,
        age: tp.age,
        hometown: tp.hometown ?? null,
        heightCm: tp.heightCm,
        weightKg: tp.weightKg,
        bust: tp.bust ?? null,
        subjects: tp.subjects,
        priceInfo: tp.priceInfo,
        coverPhotoUrl: tp.coverPhotoUrl,
        homepageUrl: tp.homepageUrl,
        media: tp.media || [],
      });
      setDisplayName(tp.displayName || '');
      setAge(tp.age != null ? String(tp.age) : '');
      setHometown(tp.hometown || '');
      setHeightCm(tp.heightCm != null ? String(tp.heightCm) : '');
      setWeightKg(tp.weightKg != null ? String(tp.weightKg) : '');
      setBust(tp.bust || '');
      setSubjects(tp.subjects || '');
      setPrices(parsePrices(tp.priceInfo));
      setCoverPhotoUrl(tp.coverPhotoUrl || '');
      setHomepageUrl(tp.homepageUrl || '');
      setLoading(false);
    })();
  }, []);

  const updatePrice = (key: keyof PriceFields, value: string) => {
    setPrices((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body: any = {
        displayName,
        bio: composeBio({ age, hometown, heightCm, weightKg, bust, subjects }),
        age: age ? parseInt(age) : null,
        hometown: hometown.trim() || null,
        heightCm: heightCm ? parseInt(heightCm) : null,
        weightKg: weightKg ? parseFloat(weightKg) : null,
        bust: bust.trim() || null,
        subjects: subjects.trim() || null,
        priceInfo: serializePrices(prices),
        coverPhotoUrl: coverPhotoUrl || null,
        homepageUrl: homepageUrl || null,
      };
      if (isNewProfile) {
        if (!displayName.trim()) {
          setMessage('❌ 请填写称呼');
          return;
        }
        const pos = await getPosition();
        if (!pos) {
          setMessage('❌ 无法获取位置，请允许定位后重试');
          return;
        }
        body.latitude = pos[0];
        body.longitude = pos[1];
      }
      const res = await fetch('/api/teachers/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        if (isNewProfile) {
          const t = data.teacher;
          setTeacher({
            displayName: t.displayName,
            bio: t.bio,
            age: t.age,
            hometown: t.hometown ?? null,
            heightCm: t.heightCm,
            weightKg: t.weightKg,
            bust: t.bust ?? null,
            subjects: t.subjects,
            priceInfo: t.priceInfo,
            coverPhotoUrl: t.coverPhotoUrl,
            homepageUrl: t.homepageUrl,
            media: [],
          });
          setIsNewProfile(false);
          setMessage('✅ 资料已创建，可以继续上传照片/视频');
        } else {
          setMessage('✅ 资料已更新');
          setTimeout(() => setMessage(null), 2000);
        }
      } else {
        setMessage(`❌ ${data.error || '保存失败'}`);
      }
    } catch {
      setMessage('❌ 网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (isNewProfile) {
      setMessage('❌ 请先保存资料，再上传作品');
      e.target.value = '';
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('sortOrder', String(teacher?.media.length ?? 0 + i));
        const res = await fetch('/api/media/upload', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const data = await res.json();
        if (!data.ok) {
          setMessage(`❌ ${data.error || '上传失败'}`);
        }
      }
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      const meData = await meRes.json();
      if (meData.ok && meData.user?.teacherProfile) {
        setTeacher((t) => t ? { ...t, media: meData.user.teacherProfile.media } : t);
      }
      setMessage('✅ 媒体上传完成');
      setTimeout(() => setMessage(null), 2000);
    } catch {
      setMessage('❌ 网络错误');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteMedia = async (id: string) => {
    if (!confirm('确定删除此媒体？')) return;
    try {
      const res = await fetch(`/api/media/${id}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setTeacher((t) => t ? { ...t, media: t.media.filter((m) => m.id !== id) } : t);
      }
    } catch {
      setMessage('❌ 删除失败');
    }
  };

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}>加载中...</div>;
  if (error) return <div style={{ padding: 24, textAlign: 'center', color: '#ef4444' }}>{error}</div>;
  if (!teacher && !isNewProfile) return null;

  const mediaList = teacher?.media ?? [];

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#f8fafc', paddingBottom: 'calc(env(safe-area-inset-bottom) + 90px)' }}>
      <div style={{ background: 'linear-gradient(135deg, #3390ec 0%, #1d4ed8 100%)', padding: 'calc(env(safe-area-inset-top) + 12px) 16px 16px', color: 'white', position: 'relative' }}>
        <a href="/maps" style={{
          position: 'absolute', left: 14, top: 'calc(env(safe-area-inset-top) + 12px)',
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: 18, textDecoration: 'none',
        }}>←</a>
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{isNewProfile ? '👨‍🏫 完善老师资料' : '✏️ 编辑老师资料'}</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            {isNewProfile ? '填写后即可出现在学生地图上' : '修改后立即对学生可见'}
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>称呼 *</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="学生怎么称呼您" style={inputStyle} />
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>👤 简介</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>年龄</label>
              <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="岁" style={inputStyle} inputMode="numeric" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>哪里人</label>
              <input value={hometown} onChange={(e) => setHometown(e.target.value)} placeholder="如 上海" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>身高</label>
              <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} placeholder="cm" style={inputStyle} inputMode="numeric" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>体重</label>
              <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="kg" style={inputStyle} inputMode="decimal" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>胸围</label>
              <input value={bust} onChange={(e) => setBust(e.target.value)} placeholder="如 88C" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>服务项目</label>
              <input value={subjects} onChange={(e) => setSubjects(e.target.value)} placeholder="如 按摩 / 陪伴" style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#64748b', marginBottom: 10, display: 'block' }}>💰 价格</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {PRICE_LABELS.map((p) => (
              <div key={p.key}>
                <label style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, display: 'block' }}>{p.label}</label>
                <input
                  value={prices[p.key]}
                  onChange={(e) => updatePrice(p.key, e.target.value)}
                  placeholder={p.placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>🖼️ 封面照片链接（可选）</label>
          <input value={coverPhotoUrl} onChange={(e) => setCoverPhotoUrl(e.target.value)} placeholder="https://..." style={inputStyle} />
          {coverPhotoUrl && (
            <img src={coverPhotoUrl} alt="" style={{ marginTop: 10, width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 8, background: '#f1f5f9' }} />
          )}
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#64748b', marginBottom: 6, display: 'block' }}>🔗 主页链接（可选）</label>
          <input value={homepageUrl} onChange={(e) => setHomepageUrl(e.target.value)} placeholder="https://your-site.com" style={inputStyle} />
        </div>

        <div style={{ background: 'white', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#64748b' }}>📸 作品展示</label>
            {!isNewProfile && (
              <label style={{ padding: '6px 14px', background: '#3390ec', color: 'white', borderRadius: 16, fontSize: 13, cursor: 'pointer' }}>
                {uploading ? '上传中...' : '➕ 添加'}
                <input type="file" multiple accept="image/*,video/*" onChange={handleUpload} style={{ display: 'none' }} />
              </label>
            )}
          </div>

          {mediaList.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {mediaList.map((m) => (
                <div key={m.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: '#f1f5f9' }}>
                  {m.type === 'VIDEO' ? (
                    <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                  ) : (
                    <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <button onClick={() => handleDeleteMedia(m.id)}
                    style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(239,68,68,0.9)', color: 'white', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: '24px' }}
                  >✕</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>还没有上传任何作品</div>
          )}
        </div>

        {message && (
          <div style={{ padding: '10px 16px', background: message.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: message.startsWith('✅') ? '#166534' : '#991b1b', borderRadius: 8, fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
            {message}
          </div>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px calc(env(safe-area-inset-bottom) + 12px)', background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(10px)', boxShadow: '0 -2px 12px rgba(0,0,0,0.08)', display: 'flex', gap: 12 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #3390ec 0%, #1d4ed8 100%)', color: 'white', border: 'none', borderRadius: 24, fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, boxShadow: '0 4px 14px rgba(51,144,236,0.35)' }}
        >
          {saving ? '保存中...' : '💾 保存修改'}
        </button>
      </div>
    </div>
  );
}
