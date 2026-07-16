import { describe, expect, it } from "vitest";
import { userEducationToResumeEducation, profileBundleToUpdatedResume } from "@/lib/mappers/profile-to-resume";
import type { ProfileBundle, UserEducation } from "@/lib/supabase/database.types";

function legacyEducation(overrides: Partial<UserEducation> = {}): UserEducation {
  return {
    id: "edu_1",
    user_id: "u1",
    profile_id: "p1",
    school: "Mabalacat City College",
    degree: "Bachelor of Science in Information Technology",
    field_of_study: null,
    gpa: null,
    location: null,
    start_date: null,
    end_date: null,
    graduation_date: "2020-07-01",
    description: null,
    display_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function bundleWith(educations: UserEducation[]): ProfileBundle {
  return {
    profile: {
      id: "p1", full_name: null, email: null, phone: null,
      role: "user", default_settings: {},
      created_at: "", updated_at: "",
    },
    resumeProfile: {
      id: "p1", user_id: "u1", label: "My Profile", full_name: "Jane", email: null,
      headline: null, phone: null, linkedin_url: null, summary: null, location: null,
      resume_template: null, photo_url: null, languages: [], prompt_overrides: null,
      is_default: true, display_order: 0, created_at: "", updated_at: "",
    },
    educations,
    skills: [],
    certifications: [],
    projects: [],
    companies: [],
  };
}

describe("education mapping keeps the section populated", () => {
  it("legacy rows (only graduation_date) still yield an end date and graduationDate", () => {
    const mapped = userEducationToResumeEducation(legacyEducation());
    expect(mapped.school).toBe("Mabalacat City College");
    expect(mapped.graduationDate).toBe("07/2020");
    expect(mapped.endDate).toBe("07/2020");
    expect(mapped.startDate).toBeUndefined();
  });

  it("new rows with start/end dates map both", () => {
    const mapped = userEducationToResumeEducation(
      legacyEducation({ start_date: "2016-09-01", end_date: "2020-07-01" })
    );
    expect(mapped.startDate).toBe("09/2016");
    expect(mapped.endDate).toBe("07/2020");
  });

  it("the resume view keeps education non-empty for legacy data", () => {
    const resume = profileBundleToUpdatedResume(bundleWith([legacyEducation()]));
    expect(resume.education).toHaveLength(1);
    expect(resume.education?.[0].graduationDate).toBe("07/2020");
  });
});
