import { TopNav } from '@/components/nav/TopNav';
import { requireUser } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-page">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <TopNav user={user} />
      <main id="main" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
