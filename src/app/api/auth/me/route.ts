import { getCurrentUser } from '@/lib/server/auth';
import { createUnauthorizedResponse } from '@/lib/server/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return createUnauthorizedResponse();
    return Response.json({ data: user, error: null });
  } catch {
    return Response.json({ data: null, error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
