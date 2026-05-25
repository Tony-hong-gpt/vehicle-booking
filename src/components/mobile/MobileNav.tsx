'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const navItems = [
  {
    href: '/m',
    label: '홈',
    activeIcon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    ),
    inactiveIcon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/m/request',
    label: '차량 신청',
    activeIcon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M12 2a1 1 0 011 1v8h8a1 1 0 110 2h-8v8a1 1 0 11-2 0v-8H3a1 1 0 110-2h8V3a1 1 0 011-1z" clipRule="evenodd" />
      </svg>
    ),
    inactiveIcon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    href: '/m/requests',
    label: '신청 확인',
    activeIcon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2H9zM7 5a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 01-2 2H9a2 2 0 01-2-2H7z" />
      </svg>
    ),
    inactiveIcon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: '/m/trips',
    label: '운행 관리',
    activeIcon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 6v12M16 6v12M3 12h18M3 6h18M3 18h18" />
        <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h16v12H4V6z" clipRule="evenodd" />
      </svg>
    ),
    inactiveIcon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
      </svg>
    ),
  },
  /* ─── 차량 현황 메뉴 (임시 비활성화 – 필요 시 주석 해제) ───
  {
    href: '/m/vehicles',
    label: '차량 현황',
    activeIcon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z" />
      </svg>
    ),
    inactiveIcon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-12h3l3 4v4h-6V4z" />
      </svg>
    ),
  },
  ─── 차량 현황 메뉴 끝 ─── */
  {
    href: '/m/profile',
    label: '내 정보',
    activeIcon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M12 4a4 4 0 100 8 4 4 0 000-8zM6 8a6 6 0 1112 0A6 6 0 016 8zm2 10a5 5 0 00-5 5 1 1 0 01-2 0 7 7 0 017-7h8a7 7 0 017 7 1 1 0 01-2 0 5 5 0 00-5-5H8z" clipRule="evenodd" />
      </svg>
    ),
    inactiveIcon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [newDispatchCount, setNewDispatchCount] = useState(0);

  useEffect(() => {
    const refreshCount = async () => {
      try {
        const [res1, res2] = await Promise.all([
          fetch('/api/requests?status=approved&page_size=50'),
          fetch('/api/requests?status=dispatched&page_size=50'),
        ]);
        if (!res1.ok || !res2.ok) return;
        const [data1, data2] = await Promise.all([res1.json(), res2.json()]);
        const ids: string[] = [
          ...(data1.data || []).map((r: any) => r.id),
          ...(data2.data || []).map((r: any) => r.id),
        ];
        const seen: string[] = JSON.parse(localStorage.getItem('seen_notifications') || '[]');
        setNewDispatchCount(ids.filter(id => !seen.includes(id)).length);
      } catch { /* silent */ }
    };

    refreshCount();
    window.addEventListener('notification-seen', refreshCount);
    return () => window.removeEventListener('notification-seen', refreshCount);
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 backdrop-blur-sm border-t border-gray-100 z-50 safe-area-bottom">
      <div className="grid grid-cols-5 px-1">
        {navItems.map(item => {
          const isActive = item.href === '/m'
            ? pathname === '/m'
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center py-2 gap-0.5 relative"
            >
              {/* 액티브 인디케이터 */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-blue-600 rounded-full" />
              )}
              <div className="relative">
                <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>
                  {isActive ? item.activeIcon : item.inactiveIcon}
                </span>
                {item.href === '/m/requests' && newDispatchCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center px-0.5">
                    <span className="text-white text-[9px] font-bold leading-none">N</span>
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium tracking-tight ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
