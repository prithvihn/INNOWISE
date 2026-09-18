import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CameraOff,
  CheckCircle2,
  Loader2,
  MessagesSquare,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Video,
  VideoOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/useAuth";
import { interviewAnswer, interviewStart } from "@/lib/api";
import { interviewResultLabel, scoreColor } from "@/lib/status";

interface QuestionState {
  interviewId: string;
  answerId: string;
  question: string;
  questionType: string;
  focus: string;
  index: number;
  total: number;
  lastEval?: { score: number; feedback: string };
}

interface CompleteState {
  result: Record<string, unknown>;
}

function mediaErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Camera/microphone permission was denied. Allow access in your browser, then reload the page.";
    }
    if (err.name === "NotFoundError" || err.name === "OverconstrainedError") {
      return "No camera or microphone was found on this device.";
    }
    if (err.name === "NotReadableError") {
      return "Your camera or microphone is already in use by another application.";
    }
    if (err.name === "SecurityError") {
      return "Camera access requires a secure (HTTPS) connection.";
    }
  }
  return "Could not access your camera or microphone.";
}

export default function InterviewPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const applicationId = searchParams.get("application") || "";

  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [complete, setComplete] = useState<CompleteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Camera / microphone state
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const init = useCallback(async () => {
    if (!applicationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await interviewStart(applicationId);
      if (res.phase === "complete") {
        setComplete({ result: res.result as Record<string, unknown> });
      } else {
        setQuestion({
          interviewId: res.interview_id,
          answerId: res.answer_id || "",
          question: res.question || "",
          questionType: res.question_type || "technical",
          focus: res.focus || "",
          index: res.question_index || 1,
          total: res.total || 5,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interview");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    init();
  }, [init]);

  // Request camera + microphone once the interview is available
  useEffect(() => {
    if (!applicationId || complete) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError("Camera/microphone access is not supported in this browser.");
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMediaError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setMediaError(mediaErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, complete]);

  // Attach the stream to the video element once it is mounted
  useEffect(() => {
    if (question && !complete && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [question, complete]);

  // Stop the media stream when the interview completes or on unmount
  useEffect(() => {
    if (complete) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [complete]);

  function toggleMic() {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = micMuted;
      setMicMuted(!micMuted);
    }
  }

  function toggleCamera() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = cameraOff;
      setCameraOff(!cameraOff);
    }
  }

  async function submitAnswer(e: FormEvent) {
    e.preventDefault();
    if (!question || answer.trim().length < 10) {
      setError("Please write a substantive answer (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await interviewAnswer(question.interviewId, question.answerId, answer.trim());
      setAnswer("");
      if (res.phase === "complete") {
        setQuestion(null);
        setComplete({ result: res.result as Record<string, unknown> });
      } else {
        setQuestion({
          interviewId: res.interview_id,
          answerId: res.answer_id || "",
          question: res.question || "",
          questionType: res.question_type || "technical",
          focus: res.focus || "",
          index: res.question_index || question.index + 1,
          total: res.total || question.total,
          lastEval: res.last_evaluation,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!applicationId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No interview selected. Return to your dashboard to see your applications.
        </CardContent>
      </Card>
    );
  }

  if (complete) {
    const r = complete.result as Record<string, unknown>;
    const raw = (r.raw as Record<string, unknown>) || r;
    const result = (r.result as string) || (raw.result as string) || "consider";
    const overall = (r.match_score as number) ?? (raw.overall_score as number) ?? null;
    const summary = (r.ai_summary as string) || (raw.summary as string) || "";
    const strengths = ((r.strengths as string[]) || []) as string[];
    const weaknesses = ((r.weaknesses as string[]) || []) as string[];
    const competency = (r.competency_scores as Record<string, number>) || (raw.competency_scores as Record<string, number>) || {};

    return (
      <div className="space-y-6">
        <Button asChild variant="ghost" className="-ml-3 text-muted-foreground">
          <Link to="/candidate">
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
        </Button>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" />
            <h2 className="text-xl font-bold tracking-tight">Interview completed</h2>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="px-3 py-1">
                {interviewResultLabel(result)}
              </Badge>
              {overall != null && (
                <span className={`text-2xl font-bold ${scoreColor(overall)}`}>{overall}/100</span>
              )}
            </div>
            {summary && <p className="max-w-md text-sm text-muted-foreground">{summary}</p>}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {strengths.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BadgeCheck className="h-4 w-4 text-success" /> Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {strengths.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {weaknesses.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Areas to improve</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {weaknesses.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {Object.keys(competency).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Competency assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(competency).map(([key, val]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-40 truncate text-sm">{key}</span>
                  <Progress value={(val as number) * 10} className="h-2 flex-1" />
                  <span className={`w-8 text-right text-sm font-semibold ${scoreColor((val as number) * 10)}`}>
                    {val}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (error && !question) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!question) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No interview available for this application yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <MessagesSquare className="h-4 w-4 text-primary" /> AI interview
          </span>
          <span className="text-xs text-muted-foreground">
            Question {question.index} of {question.total}
          </span>
        </div>
        <Progress value={(question.index / question.total) * 100} className="h-2" />
      </div>

      {/* Camera + microphone panel */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-black sm:w-72">
          <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-cover" />
          {cameraOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
              <VideoOff className="mr-2 h-4 w-4" /> Camera off
            </div>
          )}
          {mediaError && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center text-xs text-muted-foreground">
              <CameraOff className="mb-1 block h-5 w-5" />
              Camera unavailable
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">
            {micMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {micMuted ? "Mic muted" : "Mic live"}
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {mediaError ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <span className="flex items-center gap-1.5 font-medium">
                <CameraOff className="h-4 w-4" /> Camera / microphone unavailable
              </span>
              <p className="mt-1 text-xs text-muted-foreground">{mediaError}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                You can still complete the interview by typing your answers below.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={micMuted ? "secondary" : "outline"} onClick={toggleMic}>
                  {micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {micMuted ? "Unmute microphone" : "Mute microphone"}
                </Button>
                <Button type="button" size="sm" variant={cameraOff ? "secondary" : "outline"} onClick={toggleCamera}>
                  {cameraOff ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  {cameraOff ? "Turn camera on" : "Turn camera off"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your camera and microphone are active for this interview session. Answers are typed below.
              </p>
            </>
          )}
        </div>
      </div>

      {question.lastEval && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Feedback on your last answer
          </div>
          <span className="font-semibold text-primary">{question.lastEval.score}/10</span>
          <p className="mt-1 text-muted-foreground">{question.lastEval.feedback}</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <Badge variant="outline" className="mb-2 w-fit font-normal">
            {question.questionType}
          </Badge>
          <CardTitle className="text-lg leading-snug">{question.question}</CardTitle>
          {question.focus && question.focus !== question.questionType && (
            <CardDescription>Focus: {question.focus}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={submitAnswer} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="answer">Your answer</Label>
              <Textarea
                id="answer"
                placeholder="Answer as you would in a real interview…"
                className="min-h-[140px]"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {question.index < question.total ? "Submit answer & continue" : "Submit final answer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
