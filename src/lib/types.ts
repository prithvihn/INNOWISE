export type Role = "hr" | "candidate";

export interface UserRow {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  organization_id: string | null;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  created_at: string;
}

export interface JobAnalysis {
  required_skills?: string[];
  preferred_skills?: string[];
  experience?: string;
  competencies?: string[];
}

export interface JobRow {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  required_skills: string[];
  experience_years: number;
  responsibilities: string;
  status: "open" | "closed";
  ai_analysis: JobAnalysis | null;
  created_at: string;
}

export interface ResumeProfile {
  name?: string;
  email?: string;
  skills?: string[];
  experience?: string;
  projects?: string[];
  education?: string;
}

export interface CandidateRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  resume_url: string | null;
  resume_parsed: ResumeProfile | null;
  created_at: string;
}

export type ApplicationStatus =
  | "applied"
  | "screening"
  | "screening_done"
  | "interview_invited"
  | "interview_in_progress"
  | "interview_done"
  | "decided";

export interface ApplicationRow {
  id: string;
  job_id: string;
  candidate_id: string;
  resume_url: string | null;
  resume_text: string | null;
  status: ApplicationStatus;
  ats_status: "pending" | "processing" | "done" | "failed";
  created_at: string;
}

export interface EvaluationRow {
  id: string;
  application_id: string;
  type: "ats" | "interview";
  match_score: number | null;
  matched_skills: string[] | null;
  skill_gaps: string[] | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  competency_scores: Record<string, number> | null;
  evidence: string | null;
  ai_summary: string | null;
  raw: Record<string, unknown> | null;
  created_at: string;
}

export interface InterviewRow {
  id: string;
  application_id: string;
  status: "invited" | "in_progress" | "completed";
  question_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface AnswerRow {
  id: string;
  interview_id: string;
  question: string;
  question_type: string;
  focus: string | null;
  answer: string | null;
  score: number | null;
  feedback: string | null;
  created_at: string;
}

export type DecisionValue = "proceed" | "hold" | "reject";

export interface DecisionRow {
  id: string;
  application_id: string;
  decision: DecisionValue;
  hr_user_id: string;
  reason: string | null;
  ai_recommendation: Record<string, unknown> | null;
  created_at: string;
}

/** A candidate + everything the HR dashboard needs about their application. */
export interface CandidateWithApplication {
  application: ApplicationRow;
  candidate: CandidateRow;
  job: JobRow;
  ats: EvaluationRow | null;
  interview: EvaluationRow | null;
  interview_row: InterviewRow | null;
  proctoring: ProctoringSessionRow | null;
  decision: DecisionRow | null;
}

export interface ProctoringSessionRow {
  id: string;
  interview_id: string;
  application_id: string;
  candidate_id: string;
  status: "ACTIVE" | "ABANDONED" | "TERMINATED_INTEGRITY_VIOLATION" | "COMPLETED";
  token: string;
  started_at: string;
  last_heartbeat_at: string;
  heartbeat_count: number;
  question_index: number | null;
  elapsed_ms: number | null;
  violation_type: string | null;
  violation_detail: Record<string, unknown> | null;
  terminated_at: string | null;
  created_at: string;
}

export interface InterviewWithDetails {
  interview: InterviewRow;
  application: ApplicationRow;
  candidate: CandidateRow;
  job: JobRow;
  answers: AnswerRow[];
}

export interface HrRecommendation {
  ranking: {
    candidate_id: string;
    name: string;
    ats_score: number;
    interview_score: number;
    rationale: string;
  }[];
  recommended_candidate_id: string | null;
  summary: string;
}
