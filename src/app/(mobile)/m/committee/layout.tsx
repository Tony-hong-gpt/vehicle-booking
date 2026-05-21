import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth';
import CommitteeNav from '@/components/mobile/CommitteeNav';

const COMMITTEE_ROLES = ['committee_secretary', 'committee_vice', 'committee_chair', 'admin'];

export default async function CommitteeLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!COMMITTEE_ROLES.includes(user.role)) redirect('/m');

  return (
    <div className="min-h-screen bg-gray-100 md:bg-gray-100 flex flex-col max-w-md mx-auto relative md:shadow-2xl">
      <main className="flex-1 pb-20">
        {children}
      </main>
      <CommitteeNav />
    </div>
  );
}
