"use client";

import { useMemo, useState } from "react";
import DailyBidChart from "@/components/dashboard/DailyBidChart";
import DailyInterviewChart from "@/components/dashboard/DailyInterviewChart";
import InterviewCallTypeChart from "@/components/dashboard/InterviewCallTypeChart";
import SuccessRatePanel from "@/components/dashboard/SuccessRatePanel";
import TodayBidsPanel from "@/components/dashboard/TodayBidsPanel";
import {
  buildInterviewsByResume,
  computeBidSuccessStats,
  computeDailyBidCounts,
  computeDailyInterviewStats,
  computeInterviewCallTypeStats,
  countByField,
  countByJobSite,
  filterRecordsByDateRange,
  formatDisplayDate,
  getLocalDateKey,
  getMonthStartKey,
  getTodayKey,
  isToday,
  shiftDateKey,
} from "@/lib/dashboard-stats";
import type { InterviewRecord, ResumeRecord } from "@/lib/supabase/database.types";

type RangePreset = "7d" | "30d" | "month" | "all";

const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "month", label: "Month" },
  { id: "all", label: "All" },
];

function getPresetRange(
  preset: RangePreset,
  records: ResumeRecord[]
): { from: string; to: string } {
  const today = getTodayKey();

  switch (preset) {
    case "7d":
      return { from: shiftDateKey(today, -6), to: today };
    case "30d":
      return { from: shiftDateKey(today, -29), to: today };
    case "month":
      return { from: getMonthStartKey(), to: today };
    case "all": {
      if (records.length === 0) return { from: "", to: today };
      const earliest = records.reduce((min, record) => {
        const key = getLocalDateKey(record.created_at);
        return key < min ? key : min;
      }, getLocalDateKey(records[0].created_at));
      return { from: earliest, to: today };
    }
  }
}

export default function AdminBidsActivity({
  resumes,
  interviews,
  loading,
}: {
  resumes: ResumeRecord[];
  interviews: InterviewRecord[];
  loading: boolean;
}) {
  const [rangeStart, setRangeStart] = useState(getMonthStartKey);
  const [rangeEnd, setRangeEnd] = useState(getTodayKey);
  const [activePreset, setActivePreset] = useState<RangePreset>("month");

  const interviewsByResume = useMemo(
    () => buildInterviewsByResume(interviews),
    [interviews]
  );

  const todayRecords = useMemo(
    () => resumes.filter((record) => isToday(record.created_at)),
    [resumes]
  );

  const todayTotal = todayRecords.length;
  const todayByProvider = useMemo(
    () => countByField(todayRecords, "ai_type"),
    [todayRecords]
  );
  const todayByJobsite = useMemo(() => countByJobSite(todayRecords), [todayRecords]);

  const rangeRecords = useMemo(
    () => filterRecordsByDateRange(resumes, rangeStart, rangeEnd),
    [resumes, rangeStart, rangeEnd]
  );

  const rangeTotal = rangeRecords.length;
  const rangeSuccess = useMemo(
    () => computeBidSuccessStats(rangeRecords, interviewsByResume),
    [rangeRecords, interviewsByResume]
  );
  const dailyBidPoints = useMemo(
    () => computeDailyBidCounts(rangeRecords, rangeStart, rangeEnd),
    [rangeRecords, rangeStart, rangeEnd]
  );
  const dailyInterviewPoints = useMemo(
    () =>
      computeDailyInterviewStats(rangeRecords, interviewsByResume, rangeStart, rangeEnd),
    [rangeRecords, interviewsByResume, rangeStart, rangeEnd]
  );
  const interviewCallTypePoints = useMemo(
    () => computeInterviewCallTypeStats(rangeRecords, interviewsByResume),
    [rangeRecords, interviewsByResume]
  );

  const applyPreset = (preset: RangePreset) => {
    const { from, to } = getPresetRange(preset, resumes);
    setActivePreset(preset);
    setRangeStart(from);
    setRangeEnd(to);
  };

  const handleRangeStartChange = (value: string) => {
    setActivePreset("all");
    setRangeStart(value);
    if (rangeEnd && value > rangeEnd) setRangeEnd(value);
  };

  const handleRangeEndChange = (value: string) => {
    setActivePreset("all");
    setRangeEnd(value);
    if (rangeStart && value < rangeStart) setRangeStart(value);
  };

  const rangeLabel =
    rangeStart && rangeEnd
      ? `${formatDisplayDate(rangeStart)} – ${formatDisplayDate(rangeEnd)}`
      : "Select dates";

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="dashboard-header">
        <h2 className="dashboard-title">Job Bid status</h2>
        <p className="dashboard-subtitle">Bid activity for selected user</p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <TodayBidsPanel
          total={todayTotal}
          dateLabel={formatDisplayDate(getTodayKey())}
          providerEntries={todayByProvider}
          jobsiteEntries={todayByJobsite}
        />

        <section className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-600/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="label-kicker">Analytics</p>
              <p className="text-xs text-slate-500 dark:text-slate-300">{rangeLabel}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={
                    activePreset === preset.id
                      ? "range-preset range-preset-active"
                      : "range-preset"
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="admin-bids-range-start" className="filter-label">
                From
              </label>
              <input
                id="admin-bids-range-start"
                type="date"
                value={rangeStart}
                max={rangeEnd || undefined}
                onChange={(e) => handleRangeStartChange(e.target.value)}
                className="filter-control"
              />
            </div>
            <div>
              <label htmlFor="admin-bids-range-end" className="filter-label">
                To
              </label>
              <input
                id="admin-bids-range-end"
                type="date"
                value={rangeEnd}
                min={rangeStart || undefined}
                max={getTodayKey()}
                onChange={(e) => handleRangeEndChange(e.target.value)}
                className="filter-control"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center dark:border-slate-600/50 dark:bg-slate-800">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">
                Bids
              </p>
              <p className="font-display text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {rangeTotal}
              </p>
            </div>
          </div>

          <div className="analytics-group">
            <div className="analytics-group-header">
              <h3 className="analytics-group-title">Interview rate</h3>
              <p className="analytics-group-subtitle">
                {rangeSuccess.interviewBidCount} / {rangeSuccess.bidCount} at interview stage
                {rangeStart && rangeEnd ? ` · ${rangeLabel}` : ""}
              </p>
            </div>
            <DailyInterviewChart compact points={dailyInterviewPoints} />
            <InterviewCallTypeChart compact points={interviewCallTypePoints} />
            <div className="mx-auto w-full max-w-md">
              <SuccessRatePanel compact title="Overall" stats={rangeSuccess} />
            </div>
          </div>

          <div className="analytics-group">
            <div className="analytics-group-header">
              <h3 className="analytics-group-title">Bid count</h3>
              <p className="analytics-group-subtitle">
                {rangeTotal} bids in range
                {rangeStart && rangeEnd ? ` · ${rangeLabel}` : ""}
              </p>
            </div>
            <DailyBidChart compact points={dailyBidPoints} />
          </div>
        </section>
      </div>
    </div>
  );
}
