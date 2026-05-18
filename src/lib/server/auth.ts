import { createClient, createAdminClient } from './supabase';
import { User } from '../types';

export async function getSession() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  // adminClient로 RLS 우회하여 프로필 조회
  const adminSupabase = await createAdminClient();
  const { data: profile } = await adminSupabase
    .from('users')
    .select('*, department:departments(*)')
    .eq('id', user.id)
    .single();

  return profile;
}

export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

export async function requireRole(roles: string[]): Promise<User> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}

export function createUnauthorizedResponse() {
  return Response.json({ data: null, error: '인증이 필요합니다' }, { status: 401 });
}

export function createForbiddenResponse() {
  return Response.json({ data: null, error: '권한이 없습니다' }, { status: 403 });
}

export function createErrorResponse(message: string, status = 500) {
  return Response.json({ data: null, error: message }, { status });
}

export function createSuccessResponse<T>(data: T, message?: string, status = 200) {
  return Response.json({ data, error: null, message }, { status });
}
