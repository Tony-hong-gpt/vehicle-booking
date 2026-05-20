import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth';
import MobileNav from '@/components/mobile/MobileNav';

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // manager/admin은 /m/manager/* 하위 레이아웃이 별도로 처리
  if (user.role === 'manager' || user.role === 'admin') {
    return <>{children}</>;
  }

  // 위원회 역할은 /m/committee/* 하위 레이아웃이 별도로 처리
  const COMMITTEE_ROLES = ['committee_secretary', 'committee_vice', 'committee_chair'];
  if (COMMITTEE_ROLES.includes(user.role)) {
    return <>{children}</>;
  }

  if (user.role !== 'employee') redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto relative">
      <main className="flex-1 pb-20">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
