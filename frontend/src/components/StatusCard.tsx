/**
 * StatusCard — summary card for dashboard overview.
 */

interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  status?: 'healthy' | 'degraded' | 'down' | 'neutral';
}

const statusColors = {
  healthy: 'text-green-400 bg-green-400/10 border-green-400/20',
  degraded: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  down: 'text-red-400 bg-red-400/10 border-red-400/20',
  neutral: 'text-gray-300 bg-gray-800/50 border-gray-700',
};

export function StatusCard({ title, value, subtitle, status = 'neutral' }: StatusCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${statusColors[status]}`}>
      <p className="text-sm font-medium opacity-70">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {subtitle && <p className="mt-1 text-xs opacity-50">{subtitle}</p>}
    </div>
  );
}
