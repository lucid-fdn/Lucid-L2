import { DashboardSidebar } from '@/components/DashboardSidebar';

export const metadata = {
  title: 'Dashboard | Lucid L2',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
