'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

type LogEntry = { t: string; msg: string; ok?: boolean };

export default function DebugPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [amapLoaded, setAmapLoaded] = useState(false);
  const [amapVersion, setAmapVersion] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const log = (msg: string, ok?: boolean) => {
    const t = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { t, msg, ok }]);
    console.log(`[DEBUG] ${msg}`);
  };

  useEffect(() => {
    const run = async () => {
      try {
        log('1️⃣ 页面加载, 检查 window.AMap...');
        log(`   window.AMap = ${typeof (window as any).AMap !== 'undefined' ? '存在 ✅' : 'undefined ❌'}`);
        log(`   navigator.geolocation = ${typeof navigator !== 'undefined' && 'geolocation' in navigator ? '存在 ✅' : 'undefined ❌'}`);
        log(`   document.cookie = ${document.cookie || '(空)'}`);

        const params = new URLSearchParams(window.location.search);
        const devId = params.get('devId');
        const devName = params.get('devName');

        if (devId) {
          log(`2️⃣ 用 devId=${devId} 登录...`);
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ telegramId: devId, firstName: devName || 'Dev', dev: true }),
          });
          const d = await res.json();
          log(`   login response: ok=${d.ok} userRole=${d.user?.role || 'N/A'}`, d.ok);

          log('3️⃣ 调 /api/auth/me ...');
          const meRes = await fetch('/api/auth/me', { credentials: 'include' });
          const me = await meRes.json();
          log(`   auth/me: ok=${me.ok} role=${me.user?.role || 'N/A'}`, me.ok);
          if (me.ok) setUser(me.user);

          if (me.ok && me.user?.role === 'STUDENT') {
            log('4️⃣ 搜索附近在线老师...');
            const sRes = await fetch('/api/teachers/search?lat=39.9123&lon=116.4567&radius=20');
            const sd = await sRes.json();
            log(`   在线老师: ${sd.total || 0} 位`, sd.total > 0);
            setTeachers(sd.teachers || []);
          }
        }

        log('5️⃣ 检查 AMap script...');
        const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
        const amapScript = scripts.find((s) => s.includes('amap.com'));
        log(`   高德 script src: ${amapScript || '(未找到)'}`);

        if (!window.AMap && amapScript) {
          log('6️⃣ 等待 AMap 加载 (8s)...');
          const start = Date.now();
          await new Promise<void>((resolve) => {
            const t = setInterval(() => {
              if ((window as any).AMap) { clearInterval(t); resolve(); return; }
              if (Date.now() - start > 8000) { clearInterval(t); resolve(); }
            }, 100);
          });
        }

        if (window.AMap) {
          setAmapLoaded(true);
          setAmapVersion((window.AMap as any).VERSION || 'unknown');
          log(`   ✅ AMap 已加载, version=${(window.AMap as any).VERSION || '?'}`, true);

          const containerId = 'debug-amap-container';
          log(`7️⃣ 创建 AMap.Map 在 #${containerId} ...`);
          try {
            const map = new (window.AMap as any).Map(containerId, {
              zoom: 14,
              center: [116.4567, 39.9123],
            });
            log('   ✅ AMap.Map 创建成功', true);
          } catch (e: any) {
            log(`   ❌ AMap.Map 错误: ${e?.message || e}`);
            setErr(`AMap.Map 错误: ${e?.message || e}`);
          }
        } else {
          log('   ❌ AMap 未加载! 可能是: 网络问题 / key 域名白名单 / script 被拦截');
          setErr('高德 JS API 未加载，请检查 Network tab 是否有 webapi.amap.com 请求');
        }
      } catch (e: any) {
        log(`❌ 整体错误: ${e?.message || e}`);
        setErr(e?.message || String(e));
      }
    };
    run();
  }, []);

  return (
    <div style={{ minHeight: '100vh', padding: 16, background: '#f8fafc', fontFamily: 'monospace' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ fontSize: 18, color: '#1e293b', marginBottom: 12 }}>🔧 调试页面</h2>

        <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#334155' }}>🚀 快速测试</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="?devId=100000001&devName=小明" style={btn('#6366f1')}>🎓 以小明(学生)登录测试</a>
            <a href="?devId=200000001&devName=张老师" style={btn('#22c55e')}>👨‍🏫 以张老师(在线)登录</a>
            <a href="http://localhost:3000/dev-login" style={btn('#64748b')}>← 返回 dev-login</a>
          </div>
        </div>

        {err && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            ❌ {err}
          </div>
        )}

        <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, maxHeight: 220, overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#64748b' }}>📋 执行日志</div>
          {logs.map((l, i) => (
            <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: l.ok === false ? '#dc2626' : l.ok === true ? '#16a34a' : '#475569' }}>
              [{l.t}] {l.msg}
            </div>
          ))}
          {logs.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>等待执行...</div>}
        </div>

        <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#334155' }}>🗺️ AMap 状态</div>
          <div style={{ fontSize: 12, color: '#475569' }}>
            AMap 加载: {amapLoaded ? '✅ 是' : '❌ 否'}<br/>
            Version: {amapVersion || '—'}<br/>
            容器测试: <code>{amapLoaded ? '创建成功' : '跳过'}</code>
          </div>
          <div id="debug-amap-container" style={{ height: 200, marginTop: 8, background: '#e2e8f0', borderRadius: 8 }} />
        </div>

        {user && (
          <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#334155' }}>👤 当前用户</div>
            <pre style={{ fontSize: 11, color: '#475569', margin: 0 }}>{JSON.stringify(user, null, 2)}</pre>
          </div>
        )}

        {teachers.length > 0 && (
          <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#334155' }}>👨‍🏫 在线老师 ({teachers.length})</div>
            {teachers.map((t) => (
              <div key={t.id} style={{ fontSize: 12, padding: '4px 0', color: '#475569' }}>
                🟢 {t.displayName} — ({t.latitude}, {t.longitude})
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '8px 14px',
    background: color,
    color: 'white',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 13,
    cursor: 'pointer',
  };
}
