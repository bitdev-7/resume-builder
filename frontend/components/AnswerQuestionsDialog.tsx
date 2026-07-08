"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-config";
import type { AnalysisResult } from "@/lib/types/resume";

export interface QuestionAnswer {
  question: string;
  answer: string;
}

interface AnswerQuestionsDialogProps {
  open: boolean;
  onClose: () => void;
  result: AnalysisResult | null;
  apiModel: string;
  apiProvider: string;
  useOpenRouter: boolean;
  onError: (message: string) => void;
}

export default function AnswerQuestionsDialog({
  open,
  onClose,
  result,
  apiModel,
  apiProvider,
  useOpenRouter,
  onError,
}: AnswerQuestionsDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [questionsText, setQuestionsText] = useState("");
  const [answers, setAnswers] = useState<QuestionAnswer[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuestionsText("");
      setAnswers([]);
      setCopiedIndex(null);
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!result) {
      onError("Generate a resume first.");
      return;
    }
    const questions = questionsText
      .split(/\n/)
      .map((q) => q.trim())
      .filter(Boolean);
    if (questions.length === 0) {
      onError("Enter at least one question (one per line).");
      return;
    }

    setLoading(true);
    setAnswers([]);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(apiUrl("/api/answer-questions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          questions,
          resume: result,
          apiModel,
          apiProvider,
          useOpenRouter,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const data = await res.json();
      setAnswers(data.answers || []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to generate answers");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      onError("Copy failed");
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600/60 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-600/50">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Generate answers
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enter interview questions (one per line). Answers are generated from your resume.
          </p>
          <textarea
            value={questionsText}
            onChange={(e) => setQuestionsText(e.target.value)}
            placeholder={"e.g. Tell me about a time you led a project.\nWhy do you want to join us?"}
            className="input-shell mt-3 min-h-[120px] resize-y"
            rows={5}
          />
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading || !questionsText.trim() || !result}
            className="btn-primary mt-3 w-full"
          >
            {loading ? "Generating answers…" : "Get answers"}
          </button>

          {answers.length > 0 && (
            <div className="mt-5 space-y-4">
              {answers.map((qa, i) => (
                <div
                  key={i}
                  className="relative rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-600/50 dark:bg-slate-800/50"
                >
                  <p className="mb-1 pr-8 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    Q: {qa.question}
                  </p>
                  <p className="whitespace-pre-wrap pb-6 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {qa.answer}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopy(i, qa.answer)}
                    className="absolute bottom-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-800 dark:border-slate-600/60 dark:bg-slate-800 dark:text-slate-300"
                    title="Copy answer"
                  >
                    {copiedIndex === i ? "✓" : "⎘"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
