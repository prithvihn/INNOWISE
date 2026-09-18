import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CameraOff,
  CheckCircle2,
  Circle,
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
import { interviewAnswer, interviewStart, uploadInterviewRecording } from "@/lib/api";
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

// ---------------------------------------------------------------------------
// Speech recognition (Web Speech API) minimal typings
// ---------------------------------------------------------------------------
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function speechErrorMessage(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "Microphone access for speech-to-text was denied. You can type your answer instead.";
  }
  if (code === "audio-capture") {
    return "Could not capture audio for speech-to-text. You can type your answer instead.";
  }
  if (code === "network") {
    return "Speech-to-text network error. You can type your answer instead.";
  }
  if (code === "no-speech") {
    return "No speech detected. Try again, or type your answer.";
  }
  return "Speech-to-text failed. You can type your answer instead.";
}

function mediaErrorMessage(err: unknown): string {
  const isSecure = typeof window === "undefined" || window.isSecureContext !== false;
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      if (!isSecure) return "Camera access requires a secure (HTTPS) connection.";
      // The browser did not grant this origin access yet. A user-gesture
      // request (the "Enable Camera & Microphone" button) will show the prompt.
      return "Camera access was not granted for this page. Press \"Enable Camera & Microphone\" below to allow it (open the app in a full browser tab if the prompt does not appear).";
    }
    if (err.name === "NotFoundError") {
      return "No camera or microphone was found on this device.";
    }
    if (err.name === "OverconstrainedError") {
      return "No camera matching the requested settings was found on this device.";
    }
    if (err.name === "NotReadableError") {
      return "Your camera or microphone is already in use by another application.";
    }
    if (err.name === "SecurityError") {
      return "Camera access is blocked by this page's security policy.";
    }
    if (err.name === "AbortError") {
      return "Camera access was cancelled. Press \"Enable Camera & Microphone\" to try again.";
    }
  }
  if (!isSecure) return "Camera access requires a secure (HTTPS) connection.";
  return "Could not access your camera or microphone. Press \"Enable Camera & Microphone\" to try again.";
}

// ---------------------------------------------------------------------------
// MediaRecorder helpers
// ---------------------------------------------------------------------------
function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "audio/webm",
  ];
  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      /* keep trying */
    }
  }
  return undefined;
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
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaInitRef = useRef(false);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Speech-to-text state
  const [listening, setListening] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const [sttSupported] = useState<boolean>(() => getSpeechRecognition() !== null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const answerRef = useRef("");
  const dictationBaseRef = useRef("");
  const lastTranscriptRef = useRef<string | undefined>(undefined);

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

  // -------------------------------------------------------------------------
  // Recording controls
  // -------------------------------------------------------------------------
  function startRecording(stream: MediaStream) {
    if (recorderRef.current || typeof MediaRecorder === "undefined") {
      if (typeof MediaRecorder === "undefined") {
        setRecordingError("Recording is not supported in this browser — your typed answers will still be saved.");
      }
      return;
    }
    try {
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setRecordingError("Recording error — your typed answers will still be saved.");
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setRecordingError(null);
    } catch {
      setRecordingError("Recording could not be started — your typed answers will still be saved.");
    }
  }

  /** Stop the recorder, upload the file, and return its public URL (or null). */
  function stopRecordingAndUpload(): Promise<string | null> {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setRecording(false);
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        recorderRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        chunksRef.current = [];
        if (blob.size < 1024) {
          resolve(null);
          return;
        }
        uploadInterviewRecording(blob)
          .then((url) => resolve(url))
          .catch(() => {
            setRecordingError("Recording couldn't be saved — your answer was still submitted.");
            resolve(null);
          });
      };
      recorder.stop();
    });
  }

  // -------------------------------------------------------------------------
  // Single shared camera + microphone stream. `initMedia` is the ONE place that
  // calls getUserMedia; it is used on mount and by the Retry action. The stream
  // lives in streamRef and is never recreated for re-renders, question changes,
  // toggles or submissions. Tracks are stopped only when the interview
  // completes or the component truly unmounts (see cleanup effect below).
  // -------------------------------------------------------------------------
  const initMedia = useCallback(async (): Promise<void> => {
    if (!applicationId || complete) return;

    // Already have a live stream — just re-attach it (e.g. after the video
    // element re-mounts); never request a second getUserMedia.
    if (streamRef.current) {
      setMediaReady(true);
      if (videoRef.current) {
        const video = videoRef.current;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = streamRef.current;
        video.play().catch(() => {});
      }
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMediaError("Camera/microphone access is not supported in this browser.");
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setMediaError("Camera access requires a secure (HTTPS) connection.");
      return;
    }

    if (mediaInitRef.current) return; // an attempt is already in flight
    mediaInitRef.current = true;
    setMediaError(null);
    setMediaWarning(null);

    try {
      // Request camera + microphone together first (standard behavior). If the
      // microphone part is unavailable or blocked, fall back to camera-only so
      // the video feed still works, then attach audio to the SAME shared stream.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audio = audioStream.getAudioTracks()[0];
          if (audio) stream.addTrack(audio);
        } catch {
          /* camera still works without the microphone */
        }
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState !== "live") {
        setMediaError("No active camera was found. Check your camera and press Enable.");
        stream.getTracks().forEach((t) => t.stop());
        mediaInitRef.current = false;
        return;
      }

      const audioTrack = stream.getAudioTracks()[0];

      // Store the single shared stream; re-renders reuse it.
      streamRef.current = stream;
      setMediaReady(true);
      mediaInitRef.current = false;

      if (videoRef.current) {
        const video = videoRef.current;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = stream;
        video.play().catch(() => {});
      }

      if (!audioTrack || audioTrack.readyState !== "live") {
        setMediaWarning("No active microphone was found — you can still type your answers.");
      } else {
        setMediaWarning(null);
      }

      startRecording(stream);
    } catch (err) {
      console.error(
        "[interview] camera getUserMedia failed:",
        err instanceof DOMException ? `${err.name}: ${err.message}` : err
      );
      mediaInitRef.current = false;
      setMediaError(mediaErrorMessage(err));
    }
  }, [applicationId, complete]);

  // Only auto-start the camera when permission is ALREADY granted for this
  // origin. Calling getUserMedia on page load without a user gesture can be
  // auto-denied by the browser — which marks the origin as denied and causes
  // persistent "Camera unavailable". Otherwise we wait for the explicit
  // "Enable Camera & Microphone" button, which requests with a user gesture.
  useEffect(() => {
    let active = true;
    (async () => {
      let state = "unknown";
      try {
        if (navigator.permissions?.query) {
          const result = await navigator.permissions.query({ name: "camera" as PermissionName });
          state = result.state;
        }
      } catch {
        /* permissions query unsupported — wait for the Enable button */
      }
      if (!active || !applicationId || complete) return;
      if (state === "granted") {
        initMedia();
      }
    })();
    return () => {
      active = false;
    };
  }, [applicationId, complete, initMedia]);

  // Attach the stream to the video element once it is mounted (stream may
  // arrive before the element or vice versa — re-running here is harmless).
  useEffect(() => {
    if (question && !complete && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [question, complete]);

  // Stop media + recording + dictation when the interview completes or on unmount
  useEffect(() => {
    if (complete) {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setMediaReady(false);
    }
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [complete]);

  // -------------------------------------------------------------------------
  // Camera / microphone toggles (never stops the recording or the camera feed)
  // -------------------------------------------------------------------------
  function toggleMic() {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) {
      // No active stream yet — the toggle acts as an "enable" action so the
      // candidate can request camera + microphone with a user gesture.
      mediaInitRef.current = false;
      initMedia();
      return;
    }
    track.enabled = micMuted;
    setMicMuted(!micMuted);
  }

  function toggleCamera() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) {
      mediaInitRef.current = false;
      initMedia();
      return;
    }
    track.enabled = cameraOff;
    setCameraOff(!cameraOff);
  }

  // -------------------------------------------------------------------------
  // Speech-to-text
  // -------------------------------------------------------------------------
  function startDictation() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSttError("Speech-to-text is not supported in this browser — type your answer instead.");
      return;
    }
    stopDictation();
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    dictationBaseRef.current = answerRef.current;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0] && typeof result[0].transcript === "string") {
          transcript += result[0].transcript;
        }
      }
      const base = dictationBaseRef.current;
      const combined = (base ? base + " " : "") + transcript;
      setAnswer(combined);
      answerRef.current = combined;
      lastTranscriptRef.current = transcript;
    };
    recognition.onerror = (event) => {
      setSttError(speechErrorMessage(event.error));
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
      setSttError(null);
    } catch {
      setSttError("Could not start speech-to-text — type your answer instead.");
    }
  }

  function stopDictation() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setListening(false);
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  async function submitAnswer(e: FormEvent) {
    e.preventDefault();
    if (!question || answer.trim().length < 10) {
      setError("Please write a substantive answer (at least 10 characters).");
      return;
    }
    setSubmitting(true);
    setError(null);
    stopDictation();

    try {
      let recordingUrl: string | null = null;
      const isFinal = question.index >= question.total;
      if (isFinal) {
        // Last answer: stop the session recording and save it first
        recordingUrl = await stopRecordingAndUpload();
      }

      const res = await interviewAnswer(question.interviewId, question.answerId, answer.trim(), {
        transcript: lastTranscriptRef.current || undefined,
        recordingUrl: recordingUrl || undefined,
      });

      setAnswer("");
      answerRef.current = "";
      lastTranscriptRef.current = undefined;
      dictationBaseRef.current = "";
      setSttError(null);

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

      {/* Camera + microphone + recording panel */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-black sm:w-72">
          <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-cover" />
          {cameraOff && mediaReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted text-sm text-muted-foreground">
              <VideoOff className="mr-2 h-4 w-4" /> Camera off
            </div>
          )}
          {!mediaReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center text-xs text-muted-foreground">
              <CameraOff className="mb-1 block h-5 w-5" />
              {mediaError || "Camera preview — press Enable to start"}
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white">
            {!mediaReady ? <MicOff className="h-3 w-3" /> : micMuted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {!mediaReady ? "Mic off" : micMuted ? "Mic muted" : "Mic live"}
          </div>
          {recording && mediaReady && !mediaError && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-red-600/80 px-2 py-1 text-[11px] font-medium text-white">
              <Circle className="h-2.5 w-2.5 animate-pulse fill-current" /> Recording
            </div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          {!mediaReady ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-warning">
                <CameraOff className="h-4 w-4" /> Camera & microphone are off
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {mediaError ||
                  "Enable camera and microphone to start the live session. The AI interview works with typed answers even without them."}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 border-warning/40 text-warning"
                onClick={() => {
                  mediaInitRef.current = false;
                  initMedia();
                }}
              >
                <Video className="h-4 w-4" /> Enable Camera & Microphone
              </Button>
            </div>
          ) : mediaError ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <span className="flex items-center gap-1.5 font-medium">
                <CameraOff className="h-4 w-4" /> Camera / microphone unavailable
              </span>
              <p className="mt-1 text-xs text-muted-foreground">{mediaError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 border-warning/40 text-warning"
                onClick={() => {
                  mediaInitRef.current = false;
                  initMedia();
                }}
              >
                <Video className="h-4 w-4" /> Enable Camera & Microphone
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
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
                {recording
                  ? "Recording in progress — your whole interview session is being captured."
                  : "Your camera and microphone are active for this interview session. Answers are typed below."}
              </p>
            </>
          )}
          {recordingError && !mediaError && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {recordingError}
            </p>
          )}
          {mediaWarning && !mediaError && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {mediaWarning}
            </p>
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

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={listening ? "default" : "outline"}
                  onClick={listening ? stopDictation : startDictation}
                  disabled={!sttSupported || !!mediaError}
                >
                  {listening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                  {listening ? "Stop dictation" : "Speak your answer"}
                </Button>
                {listening && (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Circle className="h-2 w-2 animate-pulse fill-current" /> Listening… transcript appears in the box
                  </span>
                )}
                {!sttSupported && !mediaError && (
                  <span className="text-xs text-muted-foreground">
                    Speech-to-text isn't supported in this browser — type your answer instead.
                  </span>
                )}
              </div>
              {sttError && <p className="text-xs text-warning">{sttError}</p>}

              <Textarea
                id="answer"
                placeholder="Speak with the microphone or type your answer…"
                className="min-h-[140px]"
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  answerRef.current = e.target.value;
                }}
              />
              <p className="text-xs text-muted-foreground">
                {listening
                  ? "You can edit the transcript before submitting."
                  : "Spoken answers are transcribed into this box and can be edited. Typing works anytime."}
              </p>
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
