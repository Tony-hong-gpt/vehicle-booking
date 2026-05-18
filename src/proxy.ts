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

  // API 경로
  if (pathname.startsWith('/api/auth')) {
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
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role;
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
