import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const rawSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production-32chars-min!!';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('[FATAL] JWT_SECRET 环境变量在生产环境必须设置！请用 openssl rand -base64 64 生成。');
}
const JWT_SECRET = new TextEncoder().encode(rawSecret);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface AuthPayload {
  userId: string;
  telegramId: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN' | 'SUPER_ADMIN';
  isTeacher?: boolean;
  teacherId?: string;
}

export async function createToken(payload: AuthPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AuthPayload;
  } catch {
    return null;
  }
}

export async function signAuthCookies(payload: AuthPayload) {
  const token = await createToken(payload);
  const cookieStore = await cookies();
  cookieStore.set({
    name: 'auth_token',
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return token;
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_token');
}

export async function getCurrentUser(): Promise<AuthPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getAuthFromRequest(req: Request): Promise<AuthPayload | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return verifyToken(token);
  }
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]*)/);
    if (match) return verifyToken(decodeURIComponent(match[1]));
  }
  return null;
}

export function requireRole(allowed: AuthPayload['role'] | AuthPayload['role'][]) {
  const roles = Array.isArray(allowed) ? allowed : [allowed];
  return (auth: AuthPayload | null): AuthPayload => {
    if (!auth) throw new AuthError('未登录', 401);
    if (!roles.includes(auth.role)) throw new AuthError('无权限', 403);
    return auth;
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
