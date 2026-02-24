'use client';

/**
 * ReputationChart — radar chart showing 4-component reputation breakdown.
 * Uses pure SVG (no external chart library for MVP).
 */

interface ReputationChartProps {
  components: {
    volume: number;
    reliability: number;
    performance: number;
    consistency: number;
  };
  size?: number;
}

export function ReputationChart({ components, size = 200 }: ReputationChartProps) {
  const center = size / 2;
  const radius = size * 0.38;
  const labels = ['Volume', 'Reliability', 'Performance', 'Consistency'];
  const values = [
    components.volume / 100,
    components.reliability / 100,
    components.performance / 100,
    components.consistency / 100,
  ];

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / 4 - Math.PI / 2;
    return {
      x: center + radius * value * Math.cos(angle),
      y: center + radius * value * Math.sin(angle),
    };
  };

  // Grid lines
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  // Data polygon
  const dataPoints = values.map((v, i) => getPoint(i, v));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid */}
      {gridLevels.map((level) => {
        const points = [0, 1, 2, 3].map((i) => getPoint(i, level));
        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';
        return <path key={level} d={path} fill="none" stroke="#374151" strokeWidth="0.5" />;
      })}

      {/* Axes */}
      {[0, 1, 2, 3].map((i) => {
        const end = getPoint(i, 1);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={end.x}
            y2={end.y}
            stroke="#374151"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data polygon */}
      <path d={dataPath} fill="rgba(59, 130, 246, 0.2)" stroke="#3B82F6" strokeWidth="1.5" />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3B82F6" />
      ))}

      {/* Labels */}
      {labels.map((label, i) => {
        const p = getPoint(i, 1.2);
        return (
          <text
            key={label}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-gray-400 text-[10px]"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
