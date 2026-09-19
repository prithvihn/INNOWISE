import { supabase } from "@/integrations/supabase/client";
import type {
  ApplicationRow,
  AnswerRow,
  CandidateRow,
  CandidateWithApplication,
  DecisionRow,
  DecisionValue,
  EvaluationRow,
  HrRecommendation,
  InterviewRow,
  JobRow,
  OrganizationRow,
  ProctoringSessionRow,
  UserRow,
  VerificationClaimRow,
  VerificationRow,
} from "./types";

export const RESUMES_BUCKET = "resumes";
export const INTERVIEW_RECORDINGS_BUCKET = "interview-recordings";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

/** Extract the real error message from a failed backend-function call. */
async function functionError(err: unknown): Promise<Error> {
  const response = (err as { context?: Response } | null)?.context;
  if (response && typeof response.text === "function") {
    try {
      const body = await response.text();
      const parsed = JSON.parse(body) as { error?: string; message?: string };
      const message = parsed.error || parsed.message || "";
      if (message) return new Error(message);
    } catch {
      /* fall through to generic message */
    }
  }
  return new Error(err instanceof Error ? err.message : "Something went wrong");
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function fetchUserProfile(userId: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export async function fetchOrganization(orgId: string): Promise<OrganizationRow | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export async function fetchMyCandidate(userId: string): Promise<CandidateRow | null> {
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

// ---------------------------------------------------------------------------
// Auth profile bootstrap (run once after signup)
// ---------------------------------------------------------------------------
export async function bootstrapProfile(
  userId: string,
  role: "hr" | "candidate",
  fullName: string,
  email: string
): Promise<void> {
  if (role === "hr") {
    // Insert own user row first so the org insert policy can verify the role
    const { error: uErr } = await supabase.from("users").insert({
      id: userId,
      role,
      full_name: fullName,
      email,
      organization_id: null,
    });
    if (uErr) throw new Error(errorMessage(uErr));

    // Generate the org id client-side so we never need to read it back
    // (the org select policy only exposes it after it is linked to the user).
    const orgId = crypto.randomUUID();
    const { error: oErr } = await supabase.from("organizations").insert({
      id: orgId,
      name: `${fullName}'s Organization`,
    });
    if (oErr) throw new Error(errorMessage(oErr));

    const { error: linkErr } = await supabase
      .from("users")
      .update({ organization_id: orgId })
      .eq("id", userId);
    if (linkErr) throw new Error(errorMessage(linkErr));
  } else {
    const { error: uErr } = await supabase.from("users").insert({
      id: userId,
      role,
      full_name: fullName,
      email,
      organization_id: null,
    });
    if (uErr) throw new Error(errorMessage(uErr));

    const { error: cErr } = await supabase
      .from("candidates")
      .insert({ user_id: userId, full_name: fullName, email });
    if (cErr) throw new Error(errorMessage(cErr));
  }
}

// ---------------------------------------------------------------------------
// HR: jobs
// ---------------------------------------------------------------------------
export async function createJob(input: {
  organization_id: string;
  title: string;
  description: string;
  required_skills: string[];
  experience_years: number;
  responsibilities: string;
}): Promise<JobRow> {
  const { data, error } = await supabase
    .from("jobs")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export async function setApplicationStatus(
  applicationId: string,
  status: ApplicationRow["status"]
): Promise<void> {
  const { error } = await supabase
    .from("applications")
    .update({ status })
    .eq("id", applicationId);
  if (error) throw new Error(errorMessage(error));
}

export async function setJobStatus(jobId: string, status: "open" | "closed"): Promise<void> {
  const { error } = await supabase.from("jobs").update({ status }).eq("id", jobId);
  if (error) throw new Error(errorMessage(error));
}

// ---------------------------------------------------------------------------
// HR: candidate pipeline for a job
// ---------------------------------------------------------------------------
export async function fetchJobPipeline(jobId: string): Promise<CandidateWithApplication[]> {
  const job = await fetchJob(jobId);

  const { data: apps, error: aErr } = await supabase
    .from("applications")
    .select("*")
    .eq("job_id", jobId);
  if (aErr) throw new Error(errorMessage(aErr));

  const rows: CandidateWithApplication[] = [];
  for (const app of (apps || []) as ApplicationRow[]) {
    const [candidate, ats, interview, interviewRow, decision, verification] = await Promise.all([
      fetchCandidate(app.candidate_id),
      fetchLatestEvaluation(app.id, "ats"),
      fetchLatestEvaluation(app.id, "interview"),
      fetchLatestInterview(app.id),
      fetchLatestProctoring(app.id),
      fetchLatestDecision(app.id),
      fetchVerification(app.id),
    ]);
    if (candidate) {
      rows.push({ application: app, candidate, job, ats, interview, interview_row: interviewRow, proctoring, decision, verification });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// HR: interviews / decisions overview
// ---------------------------------------------------------------------------
export async function fetchOrgInterviews(orgId: string): Promise<{ interview: InterviewRow; application: ApplicationRow; candidate: CandidateRow; job: JobRow; answers: AnswerRow[] }[]> {
  const { data: jobs, error: jErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("organization_id", orgId);
  if (jErr) throw new Error(errorMessage(jErr));
  const jobList = (jobs || []) as JobRow[];
  const jobIds = jobList.map((j) => j.id);

  const { data: apps, error: aErr } = await supabase
    .from("applications")
    .select("*")
    .in("job_id", jobIds);
  if (aErr) throw new Error(errorMessage(aErr));
  const appList = (apps || []) as ApplicationRow[];

  const { data: interviews, error: iErr } = await supabase
    .from("interviews")
    .select("*")
    .in(
      "application_id",
      appList.map((a) => a.id)
    )
    .order("created_at", { ascending: false });
  if (iErr) throw new Error(errorMessage(iErr));
  const interviewList = (interviews || []) as InterviewRow[];

  const appById = new Map(appList.map((a) => [a.id, a]));
  const jobById = new Map(jobList.map((j) => [j.id, j]));
  const candidateById = new Map<CandidateRow["id"], CandidateRow>();
  for (const app of appList) {
    const cand = await fetchCandidate(app.candidate_id);
    if (cand) candidateById.set(cand.id, cand);
  }

  const result = [];
  for (const interview of interviewList) {
    const app = appById.get(interview.application_id);
    if (!app) continue;
    const candidate = candidateById.get(app.candidate_id);
    const job = jobById.get(app.job_id);
    if (!candidate || !job) continue;
    const answers = await fetchAnswers(interview.id);
    result.push({ interview, application: app, candidate, job, answers });
  }
  return result;
}

export async function fetchOrgDecisions(orgId: string): Promise<{ decision: DecisionRow; application: ApplicationRow; candidate: CandidateRow; job: JobRow }[]> {
  const { data: jobs, error: jErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("organization_id", orgId);
  if (jErr) throw new Error(errorMessage(jErr));
  const jobList = (jobs || []) as JobRow[];
  const jobIds = jobList.map((j) => j.id);

  const { data: apps, error: aErr } = await supabase
    .from("applications")
    .select("*")
    .in("job_id", jobIds);
  if (aErr) throw new Error(errorMessage(aErr));
  const appList = (apps || []) as ApplicationRow[];

  const { data: decisions, error: dErr } = await supabase
    .from("decisions")
    .select("*")
    .in(
      "application_id",
      appList.map((a) => a.id)
    )
    .order("created_at", { ascending: false });
  if (dErr) throw new Error(errorMessage(dErr));
  const decisionList = (decisions || []) as DecisionRow[];

  const appById = new Map(appList.map((a) => [a.id, a]));
  const jobById = new Map(jobList.map((j) => [j.id, j]));
  const result = [];
  for (const decision of decisionList) {
    const app = appById.get(decision.application_id);
    if (!app) continue;
    const job = jobById.get(app.job_id);
    const candidate = await fetchCandidate(app.candidate_id);
    if (!job || !candidate) continue;
    result.push({ decision, application: app, candidate, job });
  }
  return result;
}

export async function recordDecision(
  applicationId: string,
  hrUserId: string,
  decision: DecisionValue,
  reason: string,
  aiRecommendation: unknown
): Promise<void> {
  const { error } = await supabase.from("decisions").insert({
    application_id: applicationId,
    hr_user_id: hrUserId,
    decision,
    reason: reason || null,
    ai_recommendation: aiRecommendation as Record<string, unknown> | null,
  });
  if (error) throw new Error(errorMessage(error));

  const { error: uErr } = await supabase
    .from("applications")
    .update({ status: "decided" })
    .eq("id", applicationId);
  if (uErr) throw new Error(errorMessage(uErr));
}

// ---------------------------------------------------------------------------
// Candidate: jobs + applications
// ---------------------------------------------------------------------------
export async function fetchOpenJobs(): Promise<JobRow[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw new Error(errorMessage(error));
  return (data || []) as JobRow[];
}

export async function fetchMyApplications(candidateId: string): Promise<CandidateWithApplication[]> {
  const { data: apps, error } = await supabase
    .from("applications")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(errorMessage(error));

  const rows: CandidateWithApplication[] = [];
  for (const app of (apps || []) as ApplicationRow[]) {
    const [candidate, ats, interview, interviewRow, decision, job, verification] = await Promise.all([
      fetchCandidate(app.candidate_id),
      fetchLatestEvaluation(app.id, "ats"),
      fetchLatestEvaluation(app.id, "interview"),
      fetchLatestInterview(app.id),
      fetchLatestProctoring(app.id),
      fetchLatestDecision(app.id),
      fetchJob(app.job_id),
      fetchVerification(app.id),
    ]);
    if (candidate && job) {
      rows.push({ application: app, candidate, job, ats, interview, interview_row: interviewRow, proctoring, decision, verification });
    }
  }
  return rows;
}

export async function createApplication(
  candidateId: string,
  jobId: string,
  resumeUrl: string,
  resumeText: string
): Promise<ApplicationRow> {
  // Generate the id client-side: PostgREST cannot return the inserted row for
  // applications under RLS, so we never request a representation back.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("applications").insert({
    id,
    candidate_id: candidateId,
    job_id: jobId,
    resume_url: resumeUrl,
    resume_text: resumeText,
  });
  if (error) throw new Error(errorMessage(error));
  return {
    id,
    candidate_id: candidateId,
    job_id: jobId,
    resume_url: resumeUrl,
    resume_text: resumeText,
    status: "applied",
    ats_status: "pending",
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export async function uploadResume(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "txt";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(RESUMES_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(errorMessage(error));
  const { data } = supabase.storage.from(RESUMES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload an interview recording (video/audio blob) and return its public URL. */
export async function uploadInterviewRecording(blob: Blob): Promise<string> {
  const type = blob.type || "video/webm";
  const ext = type.includes("mp4")
    ? "mp4"
    : type.includes("ogg")
      ? "ogg"
      : type.includes("mp3")
        ? "mp3"
        : "webm";
  const path = `interview/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(INTERVIEW_RECORDINGS_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error(errorMessage(error));
  const { data } = supabase.storage.from(INTERVIEW_RECORDINGS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Backend functions (AI)
// ---------------------------------------------------------------------------
export async function analyzeJob(jobId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("analyze-job", {
    body: { job_id: jobId },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Analysis failed");
  return data?.analysis || {};
}

export async function atsScreen(applicationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("ats-screen", {
    body: { application_id: applicationId },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Screening failed");
  return data;
}

export interface InterviewStepResult {
  ok: boolean;
  phase: "question" | "complete";
  interview_id: string;
  answer_id?: string;
  question_index?: number;
  total?: number;
  question?: string;
  question_type?: string;
  focus?: string;
  last_evaluation?: { score: number; feedback: string };
  result?: Record<string, unknown> | null;
}

export async function interviewStart(applicationId: string): Promise<InterviewStepResult> {
  const { data, error } = await supabase.functions.invoke("interview-question", {
    body: { application_id: applicationId },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Interview failed");
  return data as InterviewStepResult;
}

export async function interviewAnswer(
  interviewId: string,
  answerId: string,
  answer: string,
  opts?: { transcript?: string; recordingUrl?: string }
): Promise<InterviewStepResult> {
  const { data, error } = await supabase.functions.invoke("interview-question", {
    body: {
      application_id: undefined,
      interview_id: interviewId,
      answer_id: answerId,
      answer,
      transcript: opts?.transcript || undefined,
      recording_url: opts?.recordingUrl || undefined,
    },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Interview failed");
  return data as InterviewStepResult;
}

export async function hrRecommend(jobId: string): Promise<HrRecommendation> {  const { data, error } = await supabase.functions.invoke("hr-recommend", {
    body: { job_id: jobId },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Recommendation failed");
  return data as HrRecommendation;
}

export async function fetchLatestProctoring(
  interviewId: string
): Promise<ProctoringSessionRow | null> {
  const { data, error } = await supabase
    .from("proctoring_sessions")
    .select("*")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

// ---------------------------------------------------------------------------
// Row fetchers
// ---------------------------------------------------------------------------
export async function fetchJob(jobId: string): Promise<JobRow> {
  const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw new Error(errorMessage(error));
  if (!data) throw new Error("Job not found");
  return data;
}

export async function fetchJobsForOrg(orgId: string): Promise<JobRow[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(errorMessage(error));
  return (data || []) as JobRow[];
}

export async function fetchCandidate(candidateId: string): Promise<CandidateRow | null> {
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export async function fetchOrgCandidates(orgId: string): Promise<CandidateWithApplication[]> {
  const { data: jobs, error: jErr } = await supabase
    .from("jobs")
    .select("*")
    .eq("organization_id", orgId);
  if (jErr) throw new Error(errorMessage(jErr));
  const jobList = (jobs || []) as JobRow[];
  const jobIds = jobList.map((j) => j.id);
  if (jobIds.length === 0) return [];

  const { data: apps, error: aErr } = await supabase
    .from("applications")
    .select("*")
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });
  if (aErr) throw new Error(errorMessage(aErr));

  const rows: CandidateWithApplication[] = [];
  for (const app of (apps || []) as ApplicationRow[]) {
    const [candidate, ats, interview, interviewRow, decision, job, verification] = await Promise.all([
      fetchCandidate(app.candidate_id),
      fetchLatestEvaluation(app.id, "ats"),
      fetchLatestEvaluation(app.id, "interview"),
      fetchLatestInterview(app.id),
      fetchLatestProctoring(app.id),
      fetchLatestDecision(app.id),
      fetchJob(app.job_id),
      fetchVerification(app.id),
    ]);
    if (candidate && job) {
      rows.push({ application: app, candidate, job, ats, interview, interview_row: interviewRow, proctoring, decision, verification });
    }
  }
  return rows;
}

export async function fetchLatestEvaluation(
  applicationId: string,
  type: "ats" | "interview"
): Promise<EvaluationRow | null> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .eq("application_id", applicationId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export async function fetchLatestInterview(applicationId: string): Promise<InterviewRow | null> {
  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export async function fetchAnswers(interviewId: string): Promise<AnswerRow[]> {
  const { data, error } = await supabase
    .from("interview_answers")
    .select("*")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(errorMessage(error));
  return (data || []) as AnswerRow[];
}

export async function fetchLatestDecision(applicationId: string): Promise<DecisionRow | null> {
  const { data, error } = await supabase
    .from("decisions")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

// ---------------------------------------------------------------------------
// Proctoring (interview integrity)
// ---------------------------------------------------------------------------
export interface ProctoringPolicy {
  violation_policy: "terminate_immediately" | "warn_then_terminate";
  warning_allowance: number;
  grace_period_ms: number;
}

export interface ProctoringStartResult {
  ok: boolean;
  enabled: boolean;
  session_id?: string;
  token?: string;
  policy?: ProctoringPolicy;
  locked?: boolean;
  status?: string;
  error?: string;
}

export interface ProctoringHeartbeatResult {
  ok?: boolean;
  locked?: boolean;
  status?: string;
  error?: string;
}

export interface ProctoringTerminateResult {
  ok: boolean;
  outcome?: string;
  reason_code?: string;
  reason_detail?: string;
  answered_questions?: number;
  terminated_at?: string;
  locked?: boolean;
  status?: string;
  error?: string;
}

export async function proctoringStart(interviewId: string): Promise<ProctoringStartResult> {
  const { data, error } = await supabase.functions.invoke("proctoring-start", {
    body: { interview_id: interviewId },
  });
  if (error) throw await functionError(error);
  return data as ProctoringStartResult;
}

export async function proctoringHeartbeat(token: string): Promise<ProctoringHeartbeatResult> {
  const { data, error } = await supabase.functions.invoke("proctoring-heartbeat", {
    body: { token },
  });
  if (error) throw await functionError(error);
  return data as ProctoringHeartbeatResult;
}

export async function proctoringTerminate(payload: {
  token: string;
  violation_type: string;
  timestamp?: string;
  elapsed_ms?: number;
  question_index?: number;
  detail?: Record<string, unknown>;
}): Promise<ProctoringTerminateResult> {
  const { data, error } = await supabase.functions.invoke("proctoring-terminate", {
    body: payload,
  });
  if (error) throw await functionError(error);
  return data as ProctoringTerminateResult;
}

export async function proctoringLogEvent(
  token: string,
  eventType: string,
  detail?: unknown
): Promise<void> {
  await supabase.functions.invoke("proctoring-event", {
    body: { token, event_type: eventType, detail },
  });
}

// ---------------------------------------------------------------------------
// Resume verification (post-ATS credibility stage)
// ---------------------------------------------------------------------------
export async function fetchVerification(applicationId: string): Promise<VerificationRow | null> {
  const { data, error } = await supabase
    .from("resume_verifications")
    .select("*")
    .eq("application_id", applicationId)
    .maybeSingle();
  if (error) throw new Error(errorMessage(error));
  return data;
}

export async function fetchVerificationClaims(verificationId: string): Promise<VerificationClaimRow[]> {
  const { data, error } = await supabase
    .from("verification_claims")
    .select("*")
    .eq("verification_id", verificationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(errorMessage(error));
  return (data || []) as VerificationClaimRow[];
}

export async function verifyStart(
  applicationId: string,
  consent: boolean,
  opts?: { github_username?: string; linkedin_url?: string }
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("verify-start", {
    body: {
      application_id: applicationId,
      consent,
      github_username: opts?.github_username || null,
      linkedin_url: opts?.linkedin_url || null,
    },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Verification consent failed");
  return data;
}

export async function verifyRun(applicationId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("verify-run", {
    body: { application_id: applicationId },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Verification failed");
  return data;
}

export async function verifyExplain(
  verificationId: string,
  explanations: { claim_id: string; explanation: string }[]
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("verify-explain", {
    body: { verification_id: verificationId, explanations },
  });
  if (error) throw await functionError(error);
  if (data && data.ok === false) throw new Error(data.error || "Failed to save explanation");
  return data;
}
