'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: 'grid' },
  { href: '/dashboard/agents', label: 'Agents', icon: 'users' },
  { href: '/dashboard/receipts', label: 'Receipts', icon: 'file-text' },
  { href: '/dashboard/reputation', label: 'Reputation', icon: 'star' },
  { href: '/dashboard/epochs', label: 'Epochs', icon: 'clock' },
  { href: '/dashboard/chains', label: 'Chains', icon: 'link' },
];

// Simple SVG icons
const icons: Record<string, string> = {
  'grid': 'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
  'users': 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m7-10a4 4 0 100-8 4 4 0 000 8zm6 10v-2a4 4 0 00-3-3.87m1-9.13a4 4 0 010 7.75',
  'file-text': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1v5h5m-10 4h8m-8 4h8m-8-8h2',
  'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  'clock': 'M12 22a10 10 0 100-20 10 10 0 000 20zm0-14v4l3 3',
  'link': 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71m-.54 7.12a5 5 0 01-7.54-.54l-3-3a5 5 0 017.07-7.07l1.71 1.71',
};

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-gray-800 bg-gray-950 p-4">
      <div className="mb-6">
        <Link href="/" className="text-lg font-bold text-white">
          Lucid L2
        </Link>
        <p className="text-xs text-gray-500">Dashboard</p>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={icons[item.icon]} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
