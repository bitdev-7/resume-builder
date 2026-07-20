"use client";

import { useMemo } from "react";
import { createBatchCardsFromJobs } from "@/lib/jobs-batch-state";
import type { UserJobListItem } from "@/lib/supabase/database.types";

interface JobsBatchPanelProps {
  jobs: UserJobListItem[];
  onClose: () => void;
}

export default function JobsBatchPanel({ jobs, onClose }: JobsBatchPanelProps) {
  const cards = useMemo(() => createBatchCardsFromJobs(jobs), [jobs]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <h2 className="section-title">Batch prepare</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {cards.length} {cards.length === 1 ? "job" : "jobs"} selected
          </p>
        </div>
        <button type="button" className="btn-soft" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <ul className="space-y-3">
          {cards.map((card) => (
            <li
              key={card.jobId}
              className="card-soft break-all px-4 py-3 text-sm text-slate-700 dark:text-slate-200"
            >
              {card.url}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
