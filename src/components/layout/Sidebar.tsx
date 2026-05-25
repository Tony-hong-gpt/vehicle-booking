'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User } from '@/lib/types';
import { USER_ROLE_LABELS } from '@/lib/constants';

interface SidebarProps { user: User; }

const mainNavItems = [
  {
    href: '/',
    label: '대시보드',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  },
  {
    href: '/requests',
    label: '신청 관리',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    href: '/recurring-requests',
    label: '장기 신청',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    href: '/vehicles',
    label: '차량 현황',
    icon: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z',
  },
  {
    href: '/dispatches',
    label: '배차 관리',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
];

const statsNavItems = [
  {
    href: '/statistics',
    label: '통계',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
];

const adminNavItems = [
  {
    href: '/users',
    label: '사용자 관리',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    href: '/departments',
    label: '부서 관리',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  },
  {
    href: '/vehicle-management',
    label: '차량 관리',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    href: '/vehicle-groups',
    label: '차량군 관리',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  },
  {
    href: '/purposes',
    label: '사용목적 관리',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  },
];

const ROLE_BADGE: Record<string, string> = {
  admin:    'bg-purple-500/20 text-purple-300',
  manager:  'bg-blue-500/20 text-blue-300',
  employee: 'bg-gray-700 text-gray-400',
};

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 페이지 이동 시 모바일 사이드바 자동 닫기
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // ESC 키로 닫기
  useEffect(() => {
    if (!mobileOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  const isAdmin = user.role === 'admin';

  function NavItem({ item }: { item: typeof mainNavItems[0] }) {
    const isActive = item.href === '/'
      ? pathname === '/'
      : pathname.startsWith(item.href);
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/40'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }`}
      >
        <svg className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive ? 2.5 : 1.8} d={item.icon} />
        </svg>
        {item.label}
      </Link>
    );
  }

  return (
    <>
      {/* ── 모바일 상단 바 (lg 미만에서만 표시) ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-gray-950 border-b border-white/10 flex items-center px-4 gap-3 z-30">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="메뉴 열기"
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
            </svg>
          </div>
          <span className="text-white text-sm font-bold tracking-tight">차량 신청 관리</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white text-sm font-bold shadow">
            {user.name.charAt(0)}
          </div>
        </div>
      </header>

      {/* ── 오버레이 배경 (모바일 열림 시) ── */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── 사이드바 패널 ── */}
      <aside
        className={`
          w-60 bg-gray-950 flex flex-col h-screen fixed left-0 top-0
          border-r border-white/5 z-50
          transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* 모바일 닫기 버튼 */}
        <button
          className="lg:hidden absolute top-3.5 right-3 w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          onClick={() => setMobileOpen(false)}
          aria-label="메뉴 닫기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 로고 */}
        <div className="px-4 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
              </svg>
            </div>
            <div>
              <div className="text-white text-sm font-bold leading-tight tracking-tight">차량 신청</div>
              <div className="text-gray-500 text-xs mt-0.5">관리 시스템</div>
            </div>
          </div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {mainNavItems.map(item => <NavItem key={item.href} item={item} />)}

          {isAdmin && (
            <>
              <div className="pt-5 pb-2 px-1 flex items-center gap-2">
                <span className="flex-1 h-px bg-gray-700" />
                <span className="text-[11px] font-bold text-gray-400 tracking-widest whitespace-nowrap">통계 관리</span>
                <span className="flex-1 h-px bg-gray-700" />
              </div>
              {statsNavItems.map(item => <NavItem key={item.href} item={item} />)}
            </>
          )}

          {isAdmin && (
            <>
              <div className="pt-5 pb-2 px-1 flex items-center gap-2">
                <span className="flex-1 h-px bg-gray-700" />
                <span className="text-[11px] font-bold text-gray-400 tracking-widest whitespace-nowrap">시스템 관리</span>
                <span className="flex-1 h-px bg-gray-700" />
              </div>
              {adminNavItems.map(item => <NavItem key={item.href} item={item} />)}
            </>
          )}
        </nav>

        {/* 사용자 정보 */}
        <div className="px-3 py-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors mb-1">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-sm font-medium truncate">{user.name}</div>
              <div className={`text-xs px-1.5 py-0.5 rounded-md inline-block mt-0.5 font-medium ${ROLE_BADGE[user.role] ?? 'text-gray-500'}`}>
                {USER_ROLE_LABELS[user.role]}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            로그아웃
          </button>
        </div>
      </aside>
    </>
  );
}
