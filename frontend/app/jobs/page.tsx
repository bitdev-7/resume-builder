"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import JobsGeneratePanel from "@/components/JobsGeneratePanel";
import { ToastContainer, useToast } from "@/components/Toast";
import { copyText } from "@/lib/clipboard";
import { filterJobs, getExternalJobUrl, paginateJobs } from "@/lib/jobs-page-state";
import {
  BID_STATUSES,
  type BidStatus,
  type UserJobListItem,
} from "@/lib/supabase/database.types";
import {
  addJobForUser,
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
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);

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

  const filteredJobs = useMemo(
    () => filterJobs(jobs, statusFilter),
    [jobs, statusFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));
  const visibleJobs = useMemo(
    () => paginateJobs(filteredJobs, page, pageSize),
    [filteredJobs, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [statusFilter, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
        result.attached ? "Job added" : "This job is already in your list"
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

  const handleOpen = async (job: UserJobListItem) => {
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

  const handleRemove = async (job: UserJobListItem) => {
    if (!user?.id || !window.confirm("Remove this job from your list?")) return;
    setBusyJobId(job.job_id);
    try {
      await removeMyJob(user.id, job.job_id);
      setJobs((current) => current.filter((item) => item.job_id !== job.job_id));
      showToast("success", "Job removed from your list");
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

  const generateJob = generateJobId
    ? jobs.find((job) => job.job_id === generateJobId) ?? null
    : null;

  if (generateJob) {
    return (
      <JobsGeneratePanel
        jobId={generateJob.job_id}
        jobUrl={generateJob.url}
        bidStatus={generateJob.status}
        onBack={() => setGenerateJobId(null)}
      />
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
                  {BID_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatStatus(status)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
                <span>
                  {filteredJobs.length === 0
                    ? "No matching jobs"
                    : `Showing ${(page - 1) * pageSize + 1}–${Math.min(
                        page * pageSize,
                        filteredJobs.length
                      )} of ${filteredJobs.length}`}
                  {filteredJobs.length !== jobs.length ? ` (${jobs.length} total)` : ""}
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
                  No jobs yet
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Add a job URL above to start tracking it.
                </p>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="empty-state py-12 text-center text-sm text-slate-500 dark:text-slate-300">
                No jobs match this status.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-600/60">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/90 dark:text-slate-300">
                    <tr>
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
                        <tr key={job.job_id}>
                          <td className="max-w-xl px-4 py-3">
                            <a
                              href={externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate font-medium text-blue-600 hover:underline dark:text-blue-400"
                              title={job.url}
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
                              className="select-compact w-full min-w-[8.5rem]"
                              aria-label={`Status for ${job.url}`}
                            >
                              {BID_STATUSES.map((status) => (
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
                                onClick={() => setGenerateJobId(job.job_id)}
                                disabled={busy}
                                className="btn-compact"
                              >
                                Generate
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleOpen(job)}
                                disabled={busy}
                                className="btn-compact"
                              >
                                Open
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
                                Remove
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
    </main>
  );
}
