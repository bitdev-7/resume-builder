"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { loadProfileForApp } from "@/lib/supabase/load-profile-for-app";
import { saveProfileForm } from "@/lib/supabase/services/save-profile";
import {
  createResumeProfile,
  deleteResumeProfile,
  setDefaultResumeProfile,
} from "@/lib/supabase/services/resume-profiles";
import type { ResumeProfile } from "@/lib/supabase/database.types";
import {
  RESUME_TEMPLATES,
  DEFAULT_RESUME_TEMPLATE,
  type ResumeTemplateId,
} from "@/lib/resume-templates";
import {
  profileBundleToFormState,
  parsedResumeToFormState,
  createEmptyCompanyRow,
  createEmptySkillRow,
  createEmptyLanguageRow,
  LANGUAGE_LEVELS,
  newClientId,
  type ProfileFormState,
  type CompanyFormRow,
  type EducationFormRow,
} from "@/lib/mappers/profile-form";
import type { ParsedResume } from "@/lib/resume-import";
import { apiUrl } from "@/lib/api-config";
import { WORK_TYPES } from "@/lib/supabase/database.types";
import { isSupabaseNetworkError } from "@/lib/supabase/network";
import { ToastContainer, useToast } from "@/components/Toast";

function PlusIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function TrashIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

function AddIconButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="btn-primary p-2.5" aria-label={label}>
      <PlusIcon />
    </button>
  );
}

function DeleteIconButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="btn-ghost p-2 text-red-600 hover:bg-red-50" aria-label={label}>
      <TrashIcon />
    </button>
  );
}

const emptyForm = (): ProfileFormState => ({
  label: "My Profile",
  fullName: "",
  email: "",
  headline: "",
  photoUrl: "",
  phone: "",
  location: "",
  linkedin: "",
  summary: "",
  languages: [],
  resumeTemplate: DEFAULT_RESUME_TEMPLATE,
  educations: [],
  certifications: [],
  projects: [],
  companies: [],
  skills: [],
});

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toasts, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (!authLoading && user) {
      loadProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const loadProfile = async (profileId?: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const loaded = await loadProfileForApp(supabase, {
        email: user.email,
        userId: user.id,
        profileId,
      });
      setProfiles(loaded.profiles);
      setActiveProfileId(loaded.activeProfileId);
      setForm(profileBundleToFormState(loaded.bundle));
    } catch (error) {
      console.warn("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (profileId === activeProfileId) return;
    await loadProfile(profileId);
  };

  const handleNewProfile = async () => {
    if (!user) return;
    const label = window.prompt("Name this profile (e.g. 'Data Engineer'):", "New Profile");
    if (label === null) return;
    setLoading(true);
    try {
      const created = await createResumeProfile(user.id, label.trim() || "New Profile");
      await loadProfile(created.id);
      showToast("success", "Profile created. Fill it in and Save.");
    } catch (error) {
      console.error("Error creating profile:", error);
      showToast("error", "Failed to create profile.");
      setLoading(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!user || !activeProfileId) return;
    if (profiles.length <= 1) {
      showToast("warning", "You must keep at least one profile.");
      return;
    }
    if (!window.confirm(`Delete profile "${form.label}"? This removes its resume content.`)) return;
    setLoading(true);
    try {
      await deleteResumeProfile(user.id, activeProfileId);
      await loadProfile();
      showToast("success", "Profile deleted.");
    } catch (error) {
      console.error("Error deleting profile:", error);
      showToast("error", "Failed to delete profile.");
      setLoading(false);
    }
  };

  const activeIsDefault =
    profiles.find((p) => p.id === activeProfileId)?.is_default === true;

  const handleSetDefaultProfile = async () => {
    if (!user || !activeProfileId || activeIsDefault) return;
    setLoading(true);
    try {
      await setDefaultResumeProfile(user.id, activeProfileId);
      await loadProfile(activeProfileId);
      showToast(
        "success",
        `"${form.label || "This profile"}" is now the default for Jobs Generate.`
      );
    } catch (error) {
      console.error("Error setting default profile:", error);
      showToast("error", "Failed to set default profile.");
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !activeProfileId) return;
    setSaving(true);
    try {
      await saveProfileForm(user.id, activeProfileId, form);
      // Refresh the profile list so a renamed label shows in the switcher.
      await loadProfile(activeProfileId);
      showToast("success", "Profile saved successfully.");
    } catch (error) {
      console.error("Error saving profile:", error);
      if (isSupabaseNetworkError(error)) {
        showToast(
          "error",
          "Could not save — Supabase is unreachable. Check your connection and try again."
        );
      } else {
        showToast("error", "Failed to save profile.");
      }
    } finally {
      setSaving(false);
    }
  };

  const formHasData = () =>
    Boolean(
      form.fullName.trim() ||
        form.summary.trim() ||
        form.companies.length ||
        form.educations.length ||
        form.projects.length ||
        form.certifications.length ||
        form.skills.length
    );

  const handlePhotoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast("error", "Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Downscale to a square ~320px so the stored data URL stays small.
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setForm((p) => ({ ...p, photoUrl: dataUrl }));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        // strip the "data:application/pdf;base64," prefix
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("Could not read file"));
      reader.readAsDataURL(file);
    });

  const handleResumeFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("error", "Please upload a PDF file.");
      return;
    }
    if (formHasData() && !window.confirm("This will replace the current profile fields with data from the uploaded resume. Continue?")) {
      return;
    }

    setImporting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be signed in to upload a resume");

      const pdfBase64 = await readFileAsBase64(file);
      const promptOverrides = profiles.find((p) => p.id === activeProfileId)?.prompt_overrides;
      const response = await fetch(apiUrl("/api/parse-resume"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pdfBase64,
          ...(promptOverrides ? { promptOverrides } : {}),
        }),
      });

      if (!response.ok) {
        let message = "Failed to parse resume";
        try {
          const data = await response.json();
          if (typeof data.error === "string" && data.error.trim()) message = data.error;
        } catch {
          message = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(message);
      }

      const data: { profile: ParsedResume } = await response.json();
      setForm((prev) => parsedResumeToFormState(data.profile, prev.resumeTemplate, prev.label));
      showToast("success", "Resume imported. Review the fields below and click Save.");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Failed to parse resume");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateCompany = (clientId: string, field: keyof CompanyFormRow, value: string | string[]) => {
    setForm((prev) => ({
      ...prev,
      companies: prev.companies.map((c) =>
        c.clientId === clientId ? { ...c, [field]: value } : c
      ),
    }));
  };

  const updateEducation = (clientId: string, field: keyof EducationFormRow, value: string) => {
    setForm((prev) => ({
      ...prev,
      educations: prev.educations.map((e) =>
        e.clientId === clientId ? { ...e, [field]: value } : e
      ),
    }));
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
      <div className="mx-auto max-w-4xl">
        <div className="glass-panel overflow-hidden">
          <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="page-title">Profile Settings</h2>
              <p className="page-subtitle">Manage your default resume data and PDF template.</p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleResumeFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || loading}
                className="btn-primary px-4 py-2.5"
              >
                {importing ? "Reading resume…" : "Upload Existing Resume"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 dark:border-slate-600/50 px-6 py-4">
            <div>
              <label className="field-label">Active profile</label>
              <select
                value={activeProfileId}
                onChange={(e) => void handleSwitchProfile(e.target.value)}
                disabled={loading || saving}
                className="rounded border bg-white dark:bg-slate-800 px-3 py-2 min-w-[12rem]"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={handleNewProfile} disabled={loading || saving} className="btn-soft">
              + New profile
            </button>
            <button
              type="button"
              onClick={() => void handleSetDefaultProfile()}
              disabled={loading || saving || !activeProfileId || activeIsDefault}
              className="btn-soft"
              title={
                activeIsDefault
                  ? "This profile is already the default"
                  : "Use this profile for Jobs one-click Generate"
              }
            >
              {activeIsDefault ? "Default profile" : "Set as default"}
            </button>
            <button
              type="button"
              onClick={handleDeleteProfile}
              disabled={loading || saving || profiles.length <= 1}
              className="btn-ghost px-3 py-2 text-red-600 hover:bg-red-50"
            >
              Delete profile
            </button>
          </div>

          <div className="space-y-6 p-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            ) : (
              <>
                <section className="border-b pb-6">
                  <h3 className="section-title mb-4">Profile</h3>
                  <label className="field-label">Profile name</label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder="e.g. Software Engineer"
                    className="input-shell max-w-sm"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    How this profile shows in the switcher and on the Generator.
                  </p>
                </section>

                <section className="border-b pb-6">
                  <h3 className="section-title mb-4">Resume Output</h3>
                  <label className="field-label">PDF Template</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {RESUME_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, resumeTemplate: tpl.id as ResumeTemplateId }))}
                        className={`rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                          form.resumeTemplate === tpl.id
                            ? "border-blue-500 bg-blue-50/80 ring-2 ring-blue-200 shadow-sm"
                            : "border-slate-200 dark:border-slate-600/60 bg-white dark:bg-slate-800 hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{tpl.label}</span>
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-300">{tpl.description}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="border-b pb-6">
                  <h3 className="section-title mb-4">Default Resume Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Name</label>
                      <input type="text" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} className="input-shell" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Professional Title</label>
                      <input type="text" value={form.headline} onChange={(e) => setForm((p) => ({ ...p, headline: e.target.value }))} placeholder="e.g. Software Engineer" className="input-shell" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Resume Email</label>
                      <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder={user.email || "you@example.com"} className="input-shell" />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Shown on your resume. Leave blank to use your sign-in email ({user.email}).</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                      <input type="text" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="input-shell" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
                      <input type="text" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} className="input-shell" />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700">LinkedIn</label>
                      <input type="url" value={form.linkedin} onChange={(e) => setForm((p) => ({ ...p, linkedin: e.target.value }))} className="input-shell" />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Summary</label>
                      <textarea value={form.summary} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} rows={4} className="input-shell" />
                    </div>
                    <div className="col-span-2">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Photo (optional)</label>
                      <div className="flex items-center gap-3">
                        {form.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={form.photoUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover border" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed text-xs text-slate-400">None</div>
                        )}
                        <div className="flex gap-2">
                          <label className="btn-soft cursor-pointer">
                            {form.photoUrl ? "Change" : "Upload"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoFile(file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          {form.photoUrl ? (
                            <button type="button" className="btn-ghost px-3 py-2 text-red-600" onClick={() => setForm((p) => ({ ...p, photoUrl: "" }))}>
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Shown only on the &quot;Sidebar (visual)&quot; template. Photos are discouraged for ATS/US applications.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="border-b pb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="section-title">Languages</h3>
                    <AddIconButton
                      onClick={() => setForm((p) => ({ ...p, languages: [...p.languages, createEmptyLanguageRow()] }))}
                      label="Add language"
                    />
                  </div>
                  {form.languages.length === 0 && (
                    <p className="mb-2 text-sm text-slate-500 dark:text-slate-300">No languages added.</p>
                  )}
                  {form.languages.map((lang) => (
                    <div key={lang.clientId} className="mb-2 flex gap-2">
                      <input
                        placeholder="Language (e.g. Spanish)"
                        value={lang.name}
                        onChange={(e) => setForm((p) => ({ ...p, languages: p.languages.map((row) => row.clientId === lang.clientId ? { ...row, name: e.target.value } : row) }))}
                        className="flex-1 rounded border px-3 py-2"
                      />
                      <select
                        value={lang.level}
                        onChange={(e) => setForm((p) => ({ ...p, languages: p.languages.map((row) => row.clientId === lang.clientId ? { ...row, level: e.target.value } : row) }))}
                        className="rounded border bg-white dark:bg-slate-800 px-3 py-2"
                      >
                        {LANGUAGE_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>{lvl}</option>
                        ))}
                      </select>
                      <DeleteIconButton onClick={() => setForm((p) => ({ ...p, languages: p.languages.filter((l) => l.clientId !== lang.clientId) }))} label="Remove language" />
                    </div>
                  ))}
                </section>

                <section className="border-b pb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="section-title">Education</h3>
                    <AddIconButton
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          educations: [
                            ...p.educations,
                            {
                              clientId: newClientId(),
                              degree: "",
                              school: "",
                              fieldOfStudy: "",
                              location: "",
                              startDate: "",
                              endDate: "",
                              gpa: "",
                              description: "",
                            },
                          ],
                        }))
                      }
                      label="Add education"
                    />
                  </div>
                  {form.educations.map((edu) => (
                    <div key={edu.clientId} className="mb-4 rounded-lg border p-4">
                      <div className="mb-2 flex justify-end">
                        <DeleteIconButton
                          onClick={() => setForm((p) => ({ ...p, educations: p.educations.filter((e) => e.clientId !== edu.clientId) }))}
                          label="Remove education"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <input placeholder="Degree (e.g. Bachelor of Science)" value={edu.degree} onChange={(e) => updateEducation(edu.clientId, "degree", e.target.value)} className="input-shell" />
                        <input placeholder="School" value={edu.school} onChange={(e) => updateEducation(edu.clientId, "school", e.target.value)} className="input-shell" />
                        <input placeholder="Field of study (optional)" value={edu.fieldOfStudy} onChange={(e) => updateEducation(edu.clientId, "fieldOfStudy", e.target.value)} className="input-shell" />
                        <input placeholder="Location (optional)" value={edu.location} onChange={(e) => updateEducation(edu.clientId, "location", e.target.value)} className="input-shell" />
                        <input placeholder="Start Date (MM/YYYY)" value={edu.startDate} onChange={(e) => updateEducation(edu.clientId, "startDate", e.target.value)} className="input-shell" />
                        <input placeholder="End Date (MM/YYYY or Present)" value={edu.endDate} onChange={(e) => updateEducation(edu.clientId, "endDate", e.target.value)} className="input-shell" />
                        <input placeholder="GPA (optional)" value={edu.gpa} onChange={(e) => updateEducation(edu.clientId, "gpa", e.target.value)} className="input-shell" />
                        <input placeholder="Description (optional)" value={edu.description} onChange={(e) => updateEducation(edu.clientId, "description", e.target.value)} className="input-shell" />
                      </div>
                    </div>
                  ))}
                </section>

                <section className="border-b pb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="section-title">Certifications</h3>
                    <AddIconButton
                      onClick={() => setForm((p) => ({ ...p, certifications: [...p.certifications, { clientId: newClientId(), name: "" }] }))}
                      label="Add certification"
                    />
                  </div>
                  {form.certifications.map((cert) => (
                    <div key={cert.clientId} className="mb-2 flex gap-2">
                      <input placeholder="Certification name" value={cert.name} onChange={(e) => setForm((p) => ({ ...p, certifications: p.certifications.map((row) => row.clientId === cert.clientId ? { ...row, name: e.target.value } : row) }))} className="flex-1 rounded border px-3 py-2" />
                      <DeleteIconButton onClick={() => setForm((p) => ({ ...p, certifications: p.certifications.filter((c) => c.clientId !== cert.clientId) }))} label="Remove certification" />
                    </div>
                  ))}
                </section>

                <section className="border-b pb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="section-title">Skills</h3>
                    <AddIconButton
                      onClick={() => setForm((p) => ({ ...p, skills: [...p.skills, createEmptySkillRow()] }))}
                      label="Add skill"
                    />
                  </div>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-300">
                    List skills you actually have. Use a category like Backend, Frontend, or Cloud. Use the
                    category &quot;Soft Skills&quot; for non-technical skills. These strengthen tailoring and ATS keyword coverage.
                  </p>
                  {form.skills.length === 0 && (
                    <p className="mb-2 text-sm text-slate-500 dark:text-slate-300">No skills added yet. Click the + button to add one.</p>
                  )}
                  {form.skills.map((skill) => (
                    <div key={skill.clientId} className="mb-2 flex gap-2">
                      <input
                        placeholder="Skill (e.g. Python)"
                        value={skill.skillName}
                        onChange={(e) => setForm((p) => ({ ...p, skills: p.skills.map((row) => row.clientId === skill.clientId ? { ...row, skillName: e.target.value } : row) }))}
                        className="flex-1 rounded border px-3 py-2"
                      />
                      <input
                        placeholder="Category (e.g. Backend)"
                        value={skill.category}
                        onChange={(e) => setForm((p) => ({ ...p, skills: p.skills.map((row) => row.clientId === skill.clientId ? { ...row, category: e.target.value } : row) }))}
                        className="flex-1 rounded border px-3 py-2"
                      />
                      <DeleteIconButton onClick={() => setForm((p) => ({ ...p, skills: p.skills.filter((s) => s.clientId !== skill.clientId) }))} label="Remove skill" />
                    </div>
                  ))}
                </section>

                <section className="border-b pb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="section-title">Projects</h3>
                    <AddIconButton
                      onClick={() => setForm((p) => ({ ...p, projects: [...p.projects, { clientId: newClientId(), name: "", description: "", technologies: [] }] }))}
                      label="Add project"
                    />
                  </div>
                  {form.projects.map((project) => (
                    <div key={project.clientId} className="mb-4 rounded-lg border p-4">
                      <div className="mb-2 flex justify-end">
                        <DeleteIconButton onClick={() => setForm((p) => ({ ...p, projects: p.projects.filter((pr) => pr.clientId !== project.clientId) }))} label="Remove project" />
                      </div>
                      <input placeholder="Project Name" value={project.name} onChange={(e) => setForm((p) => ({ ...p, projects: p.projects.map((row) => row.clientId === project.clientId ? { ...row, name: e.target.value } : row) }))} className="input-shell" />
                      <textarea placeholder="Description" value={project.description} onChange={(e) => setForm((p) => ({ ...p, projects: p.projects.map((row) => row.clientId === project.clientId ? { ...row, description: e.target.value } : row) }))} rows={2} className="input-shell" />
                      <input placeholder="Technologies (comma-separated)" value={project.technologies.join(", ")} onChange={(e) => setForm((p) => ({ ...p, projects: p.projects.map((row) => row.clientId === project.clientId ? { ...row, technologies: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) } : row) }))} className="w-full rounded border px-3 py-2" />
                    </div>
                  ))}
                </section>

                <section className="border-b pb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="section-title">Companies</h3>
                    <AddIconButton
                      onClick={() => setForm((p) => ({ ...p, companies: [...p.companies, createEmptyCompanyRow()] }))}
                      label="Add company"
                    />
                  </div>
                  {form.companies.length === 0 && (
                    <p className="mb-4 text-sm text-slate-500 dark:text-slate-300">No companies added yet. Click the + button to create one.</p>
                  )}
                  {form.companies.map((company, index) => (
                    <div key={company.clientId} className="mb-6 rounded-lg border border-slate-200 dark:border-slate-600/60 p-4 last:mb-0">
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="text-base font-semibold text-gray-700">Company {index + 1}</h4>
                        <DeleteIconButton
                          onClick={() => setForm((p) => ({ ...p, companies: p.companies.filter((c) => c.clientId !== company.clientId) }))}
                          label={`Delete company ${index + 1}`}
                        />
                      </div>
                      <div className="mb-4 grid grid-cols-2 gap-4">
                        <input placeholder="Job Title" value={company.title} onChange={(e) => updateCompany(company.clientId, "title", e.target.value)} className="input-shell" />
                        <input placeholder="Company Name" value={company.company} onChange={(e) => updateCompany(company.clientId, "company", e.target.value)} className="input-shell" />
                        <input placeholder="Start Date (MM/YYYY)" value={company.startDate} onChange={(e) => updateCompany(company.clientId, "startDate", e.target.value)} className="input-shell" />
                        <input placeholder="End Date (MM/YYYY or Present)" value={company.endDate} onChange={(e) => updateCompany(company.clientId, "endDate", e.target.value)} className="input-shell" />
                      </div>
                      <div className="mb-4 grid grid-cols-2 gap-4">
                        <input placeholder="Company Location" value={company.location} onChange={(e) => updateCompany(company.clientId, "location", e.target.value)} className="input-shell" />
                        <select value={company.workType} onChange={(e) => updateCompany(company.clientId, "workType", e.target.value)} className="rounded border bg-white dark:bg-slate-800 px-3 py-2">
                          <option value="">Working type</option>
                          {WORK_TYPES.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-4">
                        <label className="mb-2 block text-sm font-medium text-gray-700">Company Description</label>
                        <textarea value={company.description} onChange={(e) => updateCompany(company.clientId, "description", e.target.value)} rows={3} className="input-shell" placeholder="Enter a brief description about the company and your role" />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Achievements (one per line)</label>
                        <textarea
                          value={company.achievements.join("\n")}
                          onChange={(e) => updateCompany(company.clientId, "achievements", e.target.value.split("\n").filter((l) => l.trim()))}
                          rows={6}
                          className="input-shell"
                          placeholder="Enter achievements, one per line"
                        />
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 dark:border-slate-600/50 px-6 py-4">
            <button onClick={() => router.push("/dashboard")} className="btn-soft">Cancel</button>
            <button onClick={handleSave} disabled={saving || loading} className="btn-primary px-4 py-2.5">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
