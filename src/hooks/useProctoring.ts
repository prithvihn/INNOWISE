import { useCallback, useEffect, useRef } from "react";
import { SUPABASE_URL } from "@/integrations/supabase/client";
import {
  proctoringHeartbeat,
  proctoringLogEvent,
  proctoringTerminate,
  type ProctoringPolicy,
} from "@/lib/api";

export interface TerminatedInfo {
  outcome: string;
  reason_code: string;
  reason_detail: string;
  answered_questions?: number;
  terminated_at?: string;
}

interface UseProctoringOptions {
  token: string | null;
  policy: ProctoringPolicy | null;
  getQuestionIndex: () => number;
  onTerminated: (info: TerminatedInfo) => void;
  onWarning: (remaining: number) => void;
  onWarningResolved: () => void;
}

const HEARTBEAT_MS = 10_000;
const WARN_COUNTDOWN_MS = 10_000;

export function useProctoring({
  token,
  policy,
  getQuestionIndex,
  onTerminated,
  onWarning,
  onWarningResolved,
}: UseProctoringOptions) {
  const frozenRef = useRef(false);
  const tokenRef = useRef(token);
  const startedAtRef = useRef<number | null>(null);
  const exitingFullscreenRef = useRef(false);
  const warningCountRef = useRef(0);
  const warningTimerRef = useRef<number | null>(null);
  const graceMs = policy?.grace_period_ms ?? 400;
  const warnMode = policy?.violation_policy === "warn_then_terminate";
  const allowance = policy?.warning_allowance ?? 1;

  const onTerminatedRef = useRef(onTerminated);
  const onWarningRef = useRef(onWarning);
  const onWarningResolvedRef = useRef(onWarningResolved);
  const getQuestionIndexRef = useRef(getQuestionIndex);
  useEffect(() => {
    onTerminatedRef.current = onTerminated;
    onWarningRef.current = onWarning;
    onWarningResolvedRef.current = onWarningResolved;
    getQuestionIndexRef.current = getQuestionIndex;
  });

  const elapsedMs = () => (startedAtRef.current ? Date.now() - startedAtRef.current : 0);

  const clearWarningTimer = () => {
    if (warningTimerRef.current != null) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  };

  /** Server-authoritative termination. The server is the source of truth. */
  const doTerminate = useCallback(
    async (violationType: string, detail?: Record<string, unknown>) => {
      if (frozenRef.current) return;
      frozenRef.current = true;
      exitingFullscreenRef.current = true;
      clearWarningTimer();
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      const payload = {
        token: tokenRef.current ?? "",
        violation_type: violationType,
        timestamp: new Date().toISOString(),
        elapsed_ms: elapsedMs(),
        question_index: getQuestionIndexRef.current(),
        detail,
      };
      let info: TerminatedInfo = {
        outcome: "REJECTED",
        reason_code: "INTEGRITY_VIOLATION",
        reason_detail: `${violationType} (client-reported)`,
      };
      try {
        const res = await proctoringTerminate(payload);
        info = {
          outcome: res.outcome ?? "REJECTED",
          reason_code: res.reason_code ?? "INTEGRITY_VIOLATION",
          reason_detail: res.reason_detail ?? payload.violation_type,
          answered_questions: res.answered_questions,
          terminated_at: res.terminated_at,
        };
      } catch {
        // sendBeacon fallback: survives a closing/backgrounded tab. The server
        // accepts unsigned requests for this endpoint; the token is the key.
        try {
          const blob = new Blob([JSON.stringify(payload)], { type: "text/plain" });
          navigator.sendBeacon(`${SUPABASE_URL}/functions/v1/proctoring-terminate`, blob);
        } catch {
          /* best effort */
        }
      }
      onTerminatedRef.current(info);
    },
    []
  );

  const handleViolation = useCallback(
    (violationType: string, detail?: Record<string, unknown>) => {
      if (frozenRef.current) return;
      if (warnMode) {
        warningCountRef.current += 1;
        if (warningCountRef.current >= allowance) {
          doTerminate(violationType, detail);
          return;
        }
        onWarningRef.current(allowance - warningCountRef.current);
        clearWarningTimer();
        warningTimerRef.current = window.setTimeout(() => {
          doTerminate(violationType, { ...detail, warning_countdown_expired: true });
        }, WARN_COUNTDOWN_MS);
        return;
      }
      doTerminate(violationType, detail);
    },
    [warnMode, allowance, doTerminate]
  );

  const resolveWarning = useCallback(() => {
    clearWarningTimer();
    onWarningResolvedRef.current();
  }, []);

  /** Called once from the gate (user gesture) — enters fullscreen then monitors. */
  const start = useCallback(async (): Promise<boolean> => {
    if (frozenRef.current) return false;
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        return false; // rejected — parent shows retry prompt
      }
    }
    exitingFullscreenRef.current = false;
    startedAtRef.current = Date.now();
    return true;
  }, []);

  // Heartbeat + listeners while a session token is active and not frozen.
  useEffect(() => {
    if (!token || frozenRef.current) return;
    startedAtRef.current = startedAtRef.current ?? Date.now();

    const onVisibility = () => {
      if (document.hidden) handleViolation("tab_switched");
      else resolveWarning();
    };
    const onBlur = () => {
      window.setTimeout(() => {
        if (frozenRef.current) return;
        // False-positive guard: if the page is still visible AND has focus
        // again within the grace period, this was an OS toast / permission
        // dialog — log it as an ignored signal, not a violation.
        if (!document.hidden && document.hasFocus()) {
          proctoringLogEvent(token, "ignored_blur", { grace_period_ms: graceMs });
          return;
        }
        handleViolation("window_blurred");
      }, graceMs);
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && !exitingFullscreenRef.current) {
        handleViolation("fullscreen_exited");
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      proctoringLogEvent(token, "contextmenu", {});
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      proctoringLogEvent(token, "copy_attempt", {});
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const soft =
        (e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "p") || e.key === "F12";
      if (soft) proctoringLogEvent(token, "shortcut_soft_signal", { key: e.key });
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy, true);
    window.addEventListener("keydown", onKeyDown);

    const heartbeat = window.setInterval(async () => {
      if (frozenRef.current) return;
      try {
        const res = await proctoringHeartbeat(token);
        if (res.locked) {
          frozenRef.current = true;
          onTerminatedRef.current({
            outcome: "REJECTED",
            reason_code: "INTEGRITY_VIOLATION",
            reason_detail: `Session was closed by the proctoring system (${res.status}).`,
          });
        }
      } catch {
        /* transient — the server sweep covers missed heartbeats */
      }
    }, HEARTBEAT_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy, true);
      window.removeEventListener("keydown", onKeyDown);
      window.clearInterval(heartbeat);
      clearWarningTimer();
    };
  }, [token, graceMs, handleViolation, resolveWarning]);

  return { start, doTerminate, isFrozen: () => frozenRef.current };
}
