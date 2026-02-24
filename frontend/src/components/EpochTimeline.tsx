'use client';

/**
 * EpochTimeline — visual timeline of epoch anchoring status.
 */

interface Epoch {
  epoch_id: string;
  epoch_number?: number;
  status: string;
  created_at?: number;
  receipt_count?: number;
}

interface EpochTimelineProps {
  epochs: Epoch[];
}

const statusColors: Record<string, string> = {
  anchored: 'bg-green-400',
  pending: 'bg-yellow-400',
  failed: 'bg-red-400',
  open: 'bg-blue-400',
};

export function EpochTimeline({ epochs }: EpochTimelineProps) {
  return (
    <div className="flex items-end gap-1 overflow-x-auto py-2">
      {epochs.map((epoch) => (
        <div key={epoch.epoch_id} className="group relative flex flex-col items-center">
          {/* Tooltip */}
          <div className="invisible absolute bottom-full mb-2 w-32 rounded bg-gray-800 p-2 text-xs text-gray-300 shadow-lg group-hover:visible">
            <p className="font-medium">Epoch {epoch.epoch_number ?? epoch.epoch_id.slice(0, 8)}</p>
            <p className="text-gray-500">{epoch.status}</p>
            {epoch.receipt_count !== undefined && (
              <p className="text-gray-500">{epoch.receipt_count} receipts</p>
            )}
          </div>

          {/* Bar */}
          <div
            className={`w-4 rounded-t ${statusColors[epoch.status] || 'bg-gray-600'}`}
            style={{
              height: `${Math.max(8, (epoch.receipt_count ?? 1) * 4)}px`,
              opacity: 0.8,
            }}
          />

          {/* Dot */}
          <div
            className={`mt-1 h-2 w-2 rounded-full ${statusColors[epoch.status] || 'bg-gray-600'}`}
          />
        </div>
      ))}
    </div>
  );
}
