import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth';
import Sidebar from '@/components/layout/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role === 'employee') redirect('/m');
  if (user.role === 'manager') redirect('/m/manager');

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      <main className="flex-1 lg:ml-60 overflow-auto">
        {/* 모바일 상단 바 여백 */}
        <div className="h-14 lg:hidden" />
        {children}
      </main>
    </div>
  );
}
