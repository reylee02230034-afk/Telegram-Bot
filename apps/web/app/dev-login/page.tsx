'use client';

import { useState } from 'react';

interface SeedUser {
  telegramId: string;
  firstName: string;
  username: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN';
  hasTeacher: boolean;
  isOnline?: boolean;
  displayName?: string;
  hint: string;
}

const SEED_USERS: SeedUser[] = [
  {
    telegramId: '999999999',
    firstName: 'Admin',
    username: 'admin',
    role: 'ADMIN',
    hasTeacher: false,
    hint: '管理员 · 可看所有审核列表',
  },
  {
    telegramId: '100000001',
    firstName: '小明',
    username: 'xiaoming',
    role: 'STUDENT',
    hasTeacher: false,
    hint: '学生视角 · 看地图上的在线老师',
  },
  {
    telegramId: '100000002',
    firstName: '小红',
    username: 'xiaohong',
    role: 'STUDENT',
    hasTeacher: false,
    hint: '学生视角 · 同上',
  },
  {
    telegramId: '200000001',
    firstName: '数学张老师',
    username: 'math_teacher_zhang',
    role: 'TEACHER',
    hasTeacher: true,
    isOnline: true,
    displayName: '张老师 · 初高中数学',
    hint: '🟢 在线上课中 · 学生可见',
  },
  {
    telegramId: '200000002',
    firstName: '英语李老师',
    username: 'english_teacher_li',
    role: 'TEACHER',
    hasTeacher: true,
    isOnline: true,
    displayName: '李老师 · 英语口语',
    hint: '🟢 在线上课中 · 学生可见',
  },
  {
    telegramId: '200000003',
    firstName: '钢琴王老师',
    username: 'piano_teacher_wang',
    role: 'TEACHER',
    hasTeacher: true,
    isOnline: false,
    displayName: '王老师 · 钢琴启蒙',
    hint: '🔴 休息中 · 学生地图上看不到',
  },
  {
    telegramId: '200000004',
    firstName: '编程陈老师',
    username: 'coding_teacher_chen',
    role: 'TEACHER',
    hasTeacher: true,
    isOnline: true,
    displayName: '陈老师 · Python编程',
    hint: '🟢 在线上课中',
  },
  {
    telegramId: '200000005',
    firstName: '美术赵老师',
    username: 'art_teacher_zhao',
    role: 'TEACHER',
    hasTeacher: true,
    isOnline: false,
    displayName: '赵老师 · 少儿美术',
    hint: '🔴 休息中',
  },
];

const ROLE_BADGE: Record<string, string> = {
  STUDENT: '🎓 学生',
  TEACHER: '👨‍🏫 老师',
  ADMIN: '🛡️ 管理员',
  SUPER_ADMIN: '👑 超级管理员',
};

export default function DevLoginPage() {
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loginAs = async (user: SeedUser, redirect?: string) => {
    setLoggingIn(user.telegramId);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          telegramId: user.telegramId,
          firstName: user.firstName,
          username: user.username,
          dev: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg(`✅ 已登录为 ${user.firstName} (${ROLE_BADGE[user.role]})`);
        if (redirect) {
          setTimeout(() => {
            window.location.href = redirect;
          }, 500);
        }
      } else {
        setMsg(`❌ ${data.error || '登录失败'}`);
      }
    } catch (err) {
      setMsg(`❌ 网络错误: ${(err as Error).message}`);
    } finally {
      setLoggingIn(null);
    }
  };

  const groupBy = <T extends SeedUser>(users: T[], key: (u: T) => string): Record<string, T[]> => {
    const out: Record<string, T[]> = {};
    users.forEach((u) => {
      const k = key(u);
      (out[k] ||= []).push(u);
    });
    return out;
  };

  const groups = groupBy(SEED_USERS, (u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN' ? '🛡️ 管理员' : u.role === 'TEACHER' ? '👨‍🏫 老师' : '🎓 学生');

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '32px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #3390ec 100%)', borderRadius: 16, padding: '28px 24px', color: 'white', marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>🛠️ 开发模式 · 模拟登录</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>
            以下是项目 seed 数据中的真实用户。点击即可注入 JWT cookie，然后可以正常访问 /maps、/teacher/edit、/teachers/[id] 等所有页面。
          </div>
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            ⚠️ 此页面仅在 {`NODE_ENV !== 'production'`} 时有效。生产环境请通过 Telegram 机器人打开。
          </div>
        </div>

        {msg && (
          <div style={{ padding: '12px 16px', background: msg.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: msg.startsWith('✅') ? '#166534' : '#991b1b', borderRadius: 10, fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
            {msg}
          </div>
        )}

        {Object.entries(groups).map(([groupName, users]) => (
          <div key={groupName} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#334155', marginBottom: 12 }}>{groupName}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {users.map((u) => (
                <div
                  key={u.telegramId}
                  style={{ background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>
                        {u.displayName || u.firstName}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#e0e7ff', color: '#4338ca' }}>
                        {ROLE_BADGE[u.role]}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      @{u.username} · telegramId {u.telegramId}
                    </div>
                    <div style={{ fontSize: 12, color: u.isOnline ? '#16a34a' : '#94a3b8', marginTop: 2 }}>{u.hint}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => loginAs(u)}
                      disabled={loggingIn === u.telegramId}
                      style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: loggingIn === u.telegramId ? 0.6 : 1 }}
                    >
                      {loggingIn === u.telegramId ? '登录中...' : '登录'}
                    </button>
                    <button
                      onClick={() => loginAs(u, '/maps')}
                      disabled={loggingIn === u.telegramId}
                      style={{ padding: '8px 16px', background: '#3390ec', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: loggingIn === u.telegramId ? 0.6 : 1 }}
                    >
                      登录→地图
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 24, background: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 10 }}>🧭 快捷跳转</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <a href="/maps" style={{ padding: '6px 14px', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none', borderRadius: 8, fontSize: 13 }}>🗺️ 地图</a>
            <a href="/teacher/edit" style={{ padding: '6px 14px', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none', borderRadius: 8, fontSize: 13 }}>✏️ 编辑资料</a>
            <a href="/teachers/200000001" style={{ padding: '6px 14px', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none', borderRadius: 8, fontSize: 13 }}>👀 张老师主页</a>
            <a href="/teachers/200000003" style={{ padding: '6px 14px', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none', borderRadius: 8, fontSize: 13 }}>👀 王老师主页(离线)</a>
            <button
              onClick={async () => {
                await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ telegramId: '1', firstName: 'Visitor', dev: true }) });
                setMsg('已清除登录态（用新 visitor cookie 覆盖）');
              }}
              style={{ padding: '6px 14px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
            >
              🚪 清除登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
