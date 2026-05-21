import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth';
import ManagerNav from '@/components/mobile/ManagerNav';

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!['manager', 'admin'].includes(user.role)) redirect('/m');

  return (
    <div className="min-h-screen bg-gray-100 md:bg-gray-100 flex flex-col max-w-md mx-auto relative md:shadow-2xl">
      <main className="flex-1 pb-20">
        {children}
      </main>
      <ManagerNav />
    </div>
  );
}
