"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import JobsBatchPanel from "@/components/JobsBatchPanel";
import JobsGeneratePanel from "@/components/JobsGeneratePanel";
import { ToastContainer, useToast } from "@/components/Toast";
import { bidStatusRowClass, bidStatusSelectClass } from "@/lib/bid-status-colors";
import { copyText } from "@/lib/clipboard";
import { toggleJobSelection } from "@/lib/jobs-batch-state";
import {
  filterJobs,
  getExternalJobUrl,
  jobsInPipeline,
  JOBS_PIPELINE_STATUSES,
  JOBS_ROW_STATUSES,
  paginateJobs,
} from "@/lib/jobs-page-state";
import {
  type BidStatus,
  type UserJobListItem,
} from "@/lib/supabase/database.types";
import {
  addJobForUser,
  ignoreJobForUser,
  listJobsForUser,
  openJobForUser,
  removeMyJob,
  setJobStatusForUser,
} from "@/lib/supabase/services/jobs";

const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 30;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatus(status: BidStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function JobsPage() {
  const { user, loading: authLoading } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [jobs, setJobs] = useState<UserJobListItem[]>([]);
  const [jobUrl, setJobUrl] = useState("");
  const [statusFilter, setStatusFilter] = useState<BidStatus | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [analyseJobId, setAnalyseJobId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(
    () => new Set()
  );
  const [batchJobs, setBatchJobs] = useState<UserJobListItem[] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void listJobsForUser(user.id)
      .then((rows) => {
        if (!cancelled) setJobs(rows);
      })
      .catch((error) => {
        console.error("Failed to load jobs:", error);
        if (!cancelled) showToast("error", "Failed to load jobs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, showToast, user?.id]);

  const pipelineJobs = useMemo(() => jobsInPipeline(jobs), [jobs]);
  const filteredJobs = useMemo(
    () => filterJobs(jobs, statusFilter),
    [jobs, statusFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const visibleJobs = useMemo(
    () => paginateJobs(filteredJobs, page, pageSize),
    [filteredJobs, page, pageSize]
  );
  const selectedJobs = useMemo(
    () => visibleJobs.filter((job) => selectedJobIds.has(job.job_id)),
    [selectedJobIds, visibleJobs]
  );
  const allVisibleJobsSelected =
    visibleJobs.length > 0 && selectedJobs.length === visibleJobs.length;

  useEffect(() => {
    const pipelineJobIds = new Set(pipelineJobs.map((job) => job.job_id));
    setSelectedJobIds((current) => {
      const next = new Set(
        [...current].filter((jobId) => pipelineJobIds.has(jobId))
      );
      return next.size === current.size ? current : next;
    });
  }, [pipelineJobs]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const analyseJob = analyseJobId
    ? jobs.find((job) => job.job_id === analyseJobId) ?? null
    : null;

  useEffect(() => {
    if (!analyseJob) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAnalyseJobId(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [analyseJob]);

  useEffect(() => {
    if (!batchJobs) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBatchJobs(null);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [batchJobs]);

  const handleToggleVisibleJobs = () => {
    setSelectedJobIds((current) => {
      const next = new Set(current);
      for (const job of visibleJobs) {
        if (allVisibleJobsSelected) next.delete(job.job_id);
        else next.add(job.job_id);
      }
      return next;
    });
  };

  const handleAdd = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || adding) return;
    if (!jobUrl.trim()) {
      showToast("warning", "Enter a job URL first");
      return;
    }

    setAdding(true);
    try {
      const result = await addJobForUser(user.id, jobUrl);
      setJobs((current) => {
        const withoutExisting = current.filter((job) => job.job_id !== result.item.job_id);
        return [result.item, ...withoutExisting];
      });
      setJobUrl("");
      setStatusFilter("");
      setPage(1);
      showToast(
        "success",
        result.createdCatalog
          ? "Job added to the shared catalog"
          : result.attached
            ? "Now tracking this job"
            : "Already tracking this job"
      );
    } catch (error) {
      console.error("Failed to add job:", error);
      showToast("error", error instanceof Error ? error.message : "Failed to add job");
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (job: UserJobListItem, status: BidStatus) => {
    if (!user?.id || status === job.status) return;
    setBusyJobId(job.job_id);
    try {
      await setJobStatusForUser(user.id, [job.job_id], status);
      setJobs((current) =>
        current.map((item) =>
          item.job_id === job.job_id ? { ...item, status } : item
        )
      );
    } catch (error) {
      console.error("Failed to update job status:", error);
      showToast("error", "Failed to update status");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleOpenExternal = async (job: UserJobListItem) => {
    if (!user?.id) return;

    const externalUrl = getExternalJobUrl(job.url);
    const newTab = window.open(externalUrl, "_blank");
    if (!newTab) {
      showToast("error", "Popup blocked — allow popups for this site");
      return;
    }
    newTab.opener = null;

    setBusyJobId(job.job_id);
    try {
      const updated = await openJobForUser(user.id, job.job_id);
      setJobs((current) =>
        current.map((item) => (item.job_id === updated.job_id ? updated : item))
      );
      const finalUrl = getExternalJobUrl(updated.url);
      if (finalUrl !== externalUrl) {
        newTab.location.href = finalUrl;
      }
    } catch (error) {
      console.error("Failed to open job:", error);
      showToast("error", "Failed to open job");
      newTab.close();
    } finally {
      setBusyJobId(null);
    }
  };

  const handleCopy = async (url: string) => {
    if (await copyText(url)) {
      showToast("success", "Job URL copied");
    } else {
      showToast("error", "Copy failed");
    }
  };

  const handleIgnore = async (job: UserJobListItem) => {
    if (
      !user?.id ||
      !window.confirm(
        "Hide this job from your list? Other accounts will still see it. Re-add the URL later to bring it back."
      )
    ) {
      return;
    }
    setBusyJobId(job.job_id);
    try {
      await ignoreJobForUser(user.id, job.job_id);
      setJobs((current) =>
        current.map((item) =>
          item.job_id === job.job_id ? { ...item, status: "ignored" } : item
        )
      );
      if (analyseJobId === job.job_id) setAnalyseJobId(null);
      showToast("success", "Job ignored — hidden from your list only");
    } catch (error) {
      console.error("Failed to ignore job:", error);
      showToast("error", "Failed to ignore job");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleRemove = async (job: UserJobListItem) => {
    if (
      !user?.id ||
      !window.confirm(
        "Clear your tracking status for this job? It will stay in the shared catalog."
      )
    ) {
      return;
    }
    setBusyJobId(job.job_id);
    try {
      await removeMyJob(user.id, job.job_id);
      setJobs((current) =>
        current.map((item) =>
          item.job_id === job.job_id ? { ...item, status: "unapplied" } : item
        )
      );
      if (analyseJobId === job.job_id) setAnalyseJobId(null);
      showToast("success", "Your status cleared — job remains in the shared catalog");
    } catch (error) {
      console.error("Failed to remove job:", error);
      showToast("error", "Failed to remove job");
    } finally {
      setBusyJobId(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <main className="page-shell">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="mx-auto w-full max-w-7xl">
        <div className="glass-panel overflow-hidden">
          <div className="page-header">
            <h2 className="page-title">Jobs</h2>
            <p className="page-subtitle">
              Track job links and your application status
            </p>
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <form
              onSubmit={handleAdd}
              className="card-soft flex flex-col gap-2 p-3 sm:flex-row"
            >
              <label htmlFor="job-url" className="sr-only">
                Job URL
              </label>
              <input
                id="job-url"
                type="text"
                inputMode="url"
                value={jobUrl}
                onChange={(event) => setJobUrl(event.target.value)}
                placeholder="Paste a job URL"
                className="input-shell min-w-0 flex-1"
                disabled={adding}
              />
              <button
                type="submit"
                className="btn-primary shrink-0 sm:min-w-24"
                disabled={adding}
              >
                {adding ? "Adding…" : "Add job"}
              </button>
            </form>

            <div className="card-soft flex flex-wrap items-end justify-between gap-3 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[11rem]">
                  <label htmlFor="jobs-status-filter" className="filter-label">
                    Status
                  </label>
                  <select
                    id="jobs-status-filter"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as BidStatus | "")
                    }
                    className="filter-select"
                  >
                    <option value="">All statuses</option>
                    {JOBS_PIPELINE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {formatStatus(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={selectedJobIds.size === 0}
                  onClick={() =>
                    setBatchJobs(
                      jobs.filter((job) => selectedJobIds.has(job.job_id))
                    )
                  }
                >
                  Batch prepare ({selectedJobIds.size})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
                <span>
                  {filteredJobs.length === 0
                    ? "No matching jobs"
                    : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
                        page * pageSize,
                        filteredJobs.length
                      )} of ${filteredJobs.length}`}
                  {filteredJobs.length !== pipelineJobs.length
                    ? ` (${pipelineJobs.length} active)`
                    : ""}
                </span>
                <label className="flex items-center gap-1.5">
                  <span>Per page</span>
                  <select
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                    className="select-compact min-w-[4.5rem]"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="empty-state py-12 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No jobs in the shared catalog yet
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Add a job URL above — every account will see it.
                </p>
              </div>
            ) : pipelineJobs.length === 0 ? (
              <div className="empty-state py-12 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No active jobs here
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Jobs marked Applied or Ignored are hidden here — Applied bids are in History;
                  re-add an ignored URL to show it again.
                </p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="empty-state py-12 text-center text-sm text-slate-500 dark:text-slate-300">
                No jobs match this status.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600/60">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/90 dark:text-slate-300">
                    <tr>
                      <th className="w-12 px-4 py-3 font-semibold">
                        <input
                          type="checkbox"
                          checked={allVisibleJobsSelected}
                          onChange={handleToggleVisibleJobs}
                          aria-label="Select all jobs on this page"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                        />
                      </th>
                      <th className="px-4 py-3 font-semibold">URL</th>
                      <th className="w-44 px-4 py-3 font-semibold">Status</th>
                      <th className="w-36 px-4 py-3 font-semibold">Added</th>
                      <th className="w-56 px-4 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-600/60 dark:bg-slate-900/50">
                    {visibleJobs.map((job) => {
                      const busy = busyJobId === job.job_id;
                      const externalUrl = getExternalJobUrl(job.url);
                      return (
                        <tr
                          key={job.job_id}
                          className={`transition-colors ${bidStatusRowClass(job.status)}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedJobIds.has(job.job_id)}
                              onChange={() =>
                                setSelectedJobIds((current) =>
                                  toggleJobSelection(current, job.job_id)
                                )
                              }
                              aria-label={`Select ${job.url}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                            />
                          </td>
                          <td className="max-w-xl px-4 py-3">
                            <a
                              href={externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate font-medium text-blue-600 hover:underline dark:text-blue-400"
                              title={job.url}
                              onClick={(event) => {
                                event.preventDefault();
                                if (busy) return;
                                void handleOpenExternal(job);
                              }}
                            >
                              {job.url}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={job.status}
                              onChange={(event) =>
                                void handleStatusChange(
                                  job,
                                  event.target.value as BidStatus
                                )
                              }
                              disabled={busy}
                              className={`select-compact w-full min-w-[8.5rem] ${bidStatusSelectClass(job.status)}`}
                              aria-label={`Status for ${job.url}`}
                            >
                              {JOBS_ROW_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {formatStatus(status)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-500 dark:text-slate-300">
                            {formatDate(job.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setAnalyseJobId(job.job_id)}
                                disabled={busy}
                                className="btn-compact"
                              >
                                Analyze
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleIgnore(job)}
                                disabled={busy}
                                className="btn-compact"
                              >
                                Ignore
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleCopy(job.url)}
                                className="btn-compact"
                              >
                                Copy
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemove(job)}
                                disabled={busy}
                                className="btn-compact text-red-600 dark:text-red-400"
                              >
                                Clear status
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filteredJobs.length > 0 && totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-600/60">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-300">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={page === totalPages}
                  className="btn-soft text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {analyseJob ? (
        <>
          <button
            type="button"
            className="jobs-analyse-backdrop"
            aria-label="Close analyse panel"
            onClick={() => setAnalyseJobId(null)}
          />
          <aside
            className="jobs-analyse-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Analyse job"
          >
            <JobsGeneratePanel
              jobId={analyseJob.job_id}
              jobUrl={analyseJob.url}
              bidStatus={analyseJob.status}
              onBack={() => setAnalyseJobId(null)}
            />
          </aside>
        </>
      ) : null}

      {batchJobs ? (
        <>
          <button
            type="button"
            className="jobs-analyse-backdrop"
            aria-label="Close batch prepare panel"
            onClick={() => setBatchJobs(null)}
          />
          <aside
            className="jobs-analyse-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Batch prepare"
          >
            <JobsBatchPanel jobs={batchJobs} onClose={() => setBatchJobs(null)} />
          </aside>
        </>
      ) : null}
    </main>
  );
}
