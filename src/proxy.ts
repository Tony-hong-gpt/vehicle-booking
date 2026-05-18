import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

  // 정적 자산 및 공개 API는 즉시 통과
  const publicPaths = ['/login', '/signup', '/admin/login', '/api/'];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // 세션 갱신 (쿠키 업데이트 목적)
  const { data: { user } } = await supabase.auth.getUser();

  // 미인증 사용자 → 로그인으로 리다이렉트
  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
