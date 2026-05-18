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

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // 공개 경로
  const publicPaths = ['/login', '/signup', '/admin/login'];
  const isPublicPath = publicPaths.some(p => pathname.startsWith(p));

  // API 경로 (인증 불필요한 공개 API)
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/api/departments') || pathname.startsWith('/api/debug')) {
    return supabaseResponse;
  }

  // 미인증 사용자 → 로그인으로 리다이렉트
  if (!user && !isPublicPath) {
    const redirectUrl = request.nextUrl.clone();
    // 관리자 전용 경로면 관리자 로그인으로
    redirectUrl.pathname = pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return NextResponse.redirect(redirectUrl);
  }

  // 인증된 사용자가 공개 페이지 접근 → 역할별 홈으로 리다이렉트
  if (user && isPublicPath) {
    // RLS 우회를 위해 서비스 롤 키로 role 조회
    const adminSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    );
    const { data: profile } = await adminSupabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role;

    // role 조회 실패 시 리다이렉트 하지 않음 (루프 방지)
    if (!role) return supabaseResponse;

    const redirectUrl = request.nextUrl.clone();

    if (pathname.startsWith('/admin/login')) {
      if (role === 'admin') {
        redirectUrl.pathname = '/';
        return NextResponse.redirect(redirectUrl);
      }
      return supabaseResponse;
    }

    if (pathname === '/login' || pathname === '/signup') {
      if (role === 'admin') redirectUrl.pathname = '/';
      else if (role === 'manager') redirectUrl.pathname = '/m/manager';
      else redirectUrl.pathname = '/m';
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
