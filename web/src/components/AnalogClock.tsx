interface AnalogClockProps {
  hour: number
  minute: number
  size?: number
}

export function AnalogClock({ hour, minute, size = 120 }: AnalogClockProps) {
  const center = size / 2
  const hourHandLength = size * 0.25
  const minuteHandLength = size * 0.35

  // Convert 24-hour to 12-hour angle
  const hour12 = hour % 12
  const hourAngle = (hour12 + minute / 60) * 30 - 90
  const minuteAngle = minute * 6 - 90

  // Calculate hand endpoints
  const hourX = center + hourHandLength * Math.cos((hourAngle * Math.PI) / 180)
  const hourY = center + hourHandLength * Math.sin((hourAngle * Math.PI) / 180)
  const minuteX = center + minuteHandLength * Math.cos((minuteAngle * Math.PI) / 180)
  const minuteY = center + minuteHandLength * Math.sin((minuteAngle * Math.PI) / 180)

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="text-gray-200">
        {/* Clock face */}
        <circle
          cx={center}
          cy={center}
          r={center - 4}
          fill="white"
          stroke="currentColor"
          strokeWidth={2}
        />

        {/* Hour markers */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180)
          const innerRadius = center - 12
          const outerRadius = center - 6
          const x1 = center + innerRadius * Math.cos(angle)
          const y1 = center + innerRadius * Math.sin(angle)
          const x2 = center + outerRadius * Math.cos(angle)
          const y2 = center + outerRadius * Math.sin(angle)

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#9ca3af"
              strokeWidth={i % 3 === 0 ? 2 : 1}
            />
          )
        })}

        {/* Hour hand */}
        <line
          x1={center}
          y1={center}
          x2={hourX}
          y2={hourY}
          stroke="#1f2937"
          strokeWidth={4}
          strokeLinecap="round"
        />

        {/* Minute hand */}
        <line
          x1={center}
          y1={center}
          x2={minuteX}
          y2={minuteY}
          stroke="#0ea5e9"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Center dot */}
        <circle cx={center} cy={center} r={4} fill="#1f2937" />
      </svg>

      {/* Digital time display */}
      <div className="mt-2 text-lg font-mono text-gray-700">
        {hour.toString().padStart(2, '0')}:{minute.toString().padStart(2, '0')}
      </div>
      <div className="text-xs text-gray-400">
        {hour >= 12 ? 'PM' : 'AM'}
      </div>
    </div>
  )
}
