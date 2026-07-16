import { formatShortDate } from "@/lib/dashboard-stats";
import { formatCostUsd } from "@/lib/ai-usage";
import type { DailyAiUsagePoint } from "@/lib/ai-usage-stats";

interface DailyAiUsageChartProps {
  points: DailyAiUsagePoint[];
  compact?: boolean;
}

export default function DailyAiUsageChart({
  points,
  compact = false,
}: DailyAiUsageChartProps) {
  const maxCount = points.reduce((max, point) => Math.max(max, point.calls), 0);
  const chartHeight = compact ? 88 : 112;
  const labelStep =
    points.length > 14 ? Math.ceil(points.length / 7) : points.length > 7 ? 2 : 1;

  if (points.length === 0) {
    return (
      <div className={compact ? "chart-panel-compact" : "chart-panel"}>
        <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
          Daily AI calls
        </p>
        <p className="rounded-lg border border-dashed border-slate-200 dark:border-slate-600/60 bg-slate-50/80 dark:bg-slate-800/90 px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-300">
          Select a start and end date to see daily AI call counts.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "chart-panel-compact" : "chart-panel"}>
      <p
        className={`mb-2 font-semibold text-slate-900 dark:text-slate-50 ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        Daily AI calls
      </p>

      <div className="overflow-x-auto pb-1">
        <div
          className="flex min-w-full items-end gap-1 sm:gap-1.5"
          style={{
            minWidth: `${Math.max(points.length * 28, 280)}px`,
            height: chartHeight,
          }}
        >
          {points.map((point, index) => {
            const height =
              point.calls > 0 && maxCount > 0
                ? Math.max(8, (point.calls / maxCount) * (chartHeight - 4))
                : 0;

            return (
              <div
                key={point.date}
                className="group flex min-w-[24px] flex-1 flex-col items-center justify-end"
                title={`${formatShortDate(point.date)}: ${point.calls} call${
                  point.calls === 1 ? "" : "s"
                } · ${formatCostUsd(point.costUsd)}`}
              >
                {point.calls > 0 && (
                  <span className="mb-0.5 text-[9px] font-semibold tabular-nums text-slate-600 dark:text-slate-300 opacity-0 transition group-hover:opacity-100">
                    {point.calls}
                  </span>
                )}
                <div
                  className={`w-full max-w-[28px] rounded-t-md ${
                    point.calls > 0
                      ? "bg-gradient-to-t from-violet-600 to-fuchsia-400"
                      : "bg-slate-100"
                  }`}
                  style={{ height: point.calls > 0 ? height : 4 }}
                />
                {(index % labelStep === 0 || index === points.length - 1) && (
                  <span className="mt-1 text-[9px] tabular-nums text-slate-400">
                    {formatShortDate(point.date)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
