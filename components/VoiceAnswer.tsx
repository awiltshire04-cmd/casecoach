"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { speechMetrics, paceLabel, fillerLabel } from "@/lib/interview/metrics";

// Speech-to-text sits behind this component so the engine can be swapped later
// (a server-side transcription API) without touching any calling page. Today it
// uses the browser's Web Speech API: free, live, no key — but Chrome/Edge only,
// so every surface also accepts a typed answer.

export interface VoiceAnswerHandle {
  transcript: string;
  durationSec: number;
  mode: "voice" | "typed";
}

export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function VoiceAnswer({
  onSubmit,
  submitting,
  submitLabel = "Submit for grading",
  compact = false,
  autoFocusTyping = false,
}: {
  onSubmit: (answer: VoiceAnswerHandle) => void;
  submitting?: boolean;
  submitLabel?: string;
  compact?: boolean;
  autoFocusTyping?: boolean;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"voice" | "typed">("voice");
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [noAudioHint, setNoAudioHint] = useState(false);

  const recRef = useRef<SpeechRecognition | null>(null);
  const startedAt = useRef<number>(0);
  const accumulated = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Chrome ends recognition on silence; we restart unless the user asked to stop.
  const wantListening = useRef(false);
  const restarts = useRef(0);
  const gotAudio = useRef(false);

  useEffect(() => {
    const ok = isSpeechSupported();
    setSupported(ok);
    if (!ok) setMode("typed");
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    wantListening.current = false;
    recRef.current?.stop();
    setListening(false);
    stopTimer();
    if (startedAt.current) {
      accumulated.current += (Date.now() - startedAt.current) / 1000;
      startedAt.current = 0;
    }
  }, [stopTimer]);

  useEffect(() => {
    return () => {
      wantListening.current = false;
      recRef.current?.abort();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    setMicError(null);

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      gotAudio.current = true;
      setNoAudioHint(false);
      let addition = "";
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) addition += r[0].transcript;
        else pending += r[0].transcript;
      }
      if (addition) setFinalText((t) => (t ? `${t.trim()} ${addition.trim()}` : addition.trim()));
      setInterim(pending);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech") return; // benign; recognition restarts below
      wantListening.current = false;
      setListening(false);
      stopTimer();
      setMicError(
        e.error === "not-allowed"
          ? "Microphone access was blocked. Allow it in your browser's site settings, or switch to typing."
          : `Speech recognition stopped: ${e.error}. You can switch to typing.`
      );
    };

    rec.onstart = () => {
      // Only now is the engine actually capturing. Claiming "Listening" before
      // this is how a failed start looks identical to a working one.
      setListening(true);
      // "Listening" with nothing arriving is the hardest state to debug from the
      // outside, so call it out rather than letting the timer tick forever.
      window.setTimeout(() => {
        if (wantListening.current && !gotAudio.current) setNoAudioHint(true);
      }, 7000);
      startedAt.current = Date.now();
      stopTimer();
      timerRef.current = setInterval(() => {
        setElapsed(Math.round(accumulated.current + (Date.now() - startedAt.current) / 1000));
      }, 250);
    };

    rec.onend = () => {
      // Silence ends a recognition run; resume so long pauses don't cut you off.
      // But a mic that never produces audio ends instantly and forever, so cap
      // the restarts rather than spinning invisibly.
      if (!wantListening.current) return;
      restarts.current += 1;
      if (restarts.current > 40) {
        wantListening.current = false;
        setListening(false);
        stopTimer();
        setMicError(
          "Speech recognition kept dropping out without picking up any audio. Check that the right microphone is selected and unmuted in your browser's site settings, or switch to typing."
        );
        return;
      }
      try {
        rec.start();
      } catch {
        /* already restarting */
      }
    };

    recRef.current = rec;
    wantListening.current = true;
    restarts.current = 0;
    gotAudio.current = false;
    setNoAudioHint(false);
    try {
      rec.start();
    } catch (e) {
      wantListening.current = false;
      setListening(false);
      setMicError(
        `Couldn't start speech recognition${e instanceof Error ? ` (${e.message})` : ""}. Reload the page, or switch to typing.`
      );
      return;
    }

    // If onstart never fires, the engine failed silently — say so.
    window.setTimeout(() => {
      if (wantListening.current && !startedAt.current) {
        setMicError(
          "Speech recognition didn't start. This browser may not support it, or the microphone is blocked — switch to typing to carry on."
        );
      }
    }, 2500);
  }, [stopTimer]);

  const reset = () => {
    stop();
    setFinalText("");
    setInterim("");
    setTyped("");
    setElapsed(0);
    accumulated.current = 0;
  };

  const spoken = `${finalText}${interim ? ` ${interim}` : ""}`.trim();
  const text = mode === "voice" ? spoken : typed;
  const duration = mode === "voice" ? Math.round(accumulated.current + (listening && startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0)) : 0;
  const live = speechMetrics(text, duration || 1);
  const wordCount = live.wordCount;
  const ready = wordCount >= 10 && !submitting;

  const pace = paceLabel(live.wpm);
  const fill = fillerLabel(live.fillerRate);

  return (
    <div className="stack">
      {supported === false && (
        <div className="callout">
          <h4>Voice input isn&apos;t available in this browser</h4>
          <p>
            Speech recognition needs Chrome or Edge. Type your answer below instead — it&apos;s graded the same
            way, minus the pacing and filler-word signals.
          </p>
        </div>
      )}
      {micError && (
        <div className="callout error">
          <p>{micError}</p>
        </div>
      )}
      {noAudioHint && !micError && (
        <div className="callout">
          <h4>Listening, but nothing is coming through</h4>
          <p>
            The recogniser is running and hasn&apos;t received any audio. Usually that&apos;s Chrome listening to the
            wrong input — click the padlock in the address bar and check which microphone this site is using, and
            that it isn&apos;t muted. You can switch to typing and keep going in the meantime.
          </p>
        </div>
      )}

      {supported && (
        <div className="row wrap">
          <div className="modeswitch">
            <button className={mode === "voice" ? "on" : ""} onClick={() => { stop(); setMode("voice"); }}>
              Speak
            </button>
            <button className={mode === "typed" ? "on" : ""} onClick={() => { stop(); setMode("typed"); }}>
              Type
            </button>
          </div>
          <div className="spacer" />
          {mode === "voice" && (
            <span className="sub mono">
              {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
            </span>
          )}
        </div>
      )}

      {mode === "voice" ? (
        <>
          <div className={`recorder${listening ? " live" : ""}`}>
            {listening ? (
              <>
                <span className="pulse" />
                <span className="rec-label">Listening — speak naturally</span>
              </>
            ) : (
              <span className="rec-label muted">
                {spoken ? "Paused. Resume to keep going." : "Press record and answer out loud."}
              </span>
            )}
            <div className="spacer" />
            {!listening ? (
              <button className="accent" onClick={start} disabled={submitting}>
                {spoken ? "Resume" : "Record"}
              </button>
            ) : (
              <button onClick={stop}>Stop</button>
            )}
          </div>

          <div className="transcript" aria-live="polite">
            {spoken ? (
              <>
                {finalText}
                {interim && <span className="interim"> {interim}</span>}
              </>
            ) : (
              <span className="muted">Your words appear here as you speak. You can edit them before submitting.</span>
            )}
          </div>

          {spoken && !listening && (
            <details className="tweak">
              <summary>Fix a transcription slip</summary>
              <textarea rows={5} value={finalText} onChange={(e) => setFinalText(e.target.value)} />
              <p className="sub">
                Speech recognition mangles finance terms — EBITDA, LBO, add-on. Correcting them here makes the
                grade fairer.
              </p>
            </details>
          )}
        </>
      ) : (
        <textarea
          rows={compact ? 6 : 9}
          value={typed}
          autoFocus={autoFocusTyping}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Answer as you would out loud — lead with the point, then the specifics, then the takeaway."
        />
      )}

      <div className="row wrap">
        <span className="chip">{wordCount} words</span>
        {mode === "voice" && duration > 0 && (
          <>
            <span className={`chip ${pace.tone}`}>{live.wpm} wpm · {pace.label}</span>
            <span className={`chip ${fill.tone}`}>
              {live.fillerCount} filler{live.fillerCount === 1 ? "" : "s"} · {fill.label}
            </span>
          </>
        )}
        <div className="spacer" />
        {(text || elapsed > 0) && (
          <button className="ghost" onClick={reset} disabled={submitting}>
            Start over
          </button>
        )}
        <button
          className="primary"
          disabled={!ready}
          onClick={() => {
            stop();
            onSubmit({ transcript: text, durationSec: duration, mode });
          }}
        >
          {submitting ? (
            <>
              <span className="spin" /> &nbsp;Grading…
            </>
          ) : (
            submitLabel
          )}
        </button>
      </div>
      {wordCount > 0 && wordCount < 10 && (
        <p className="sub">A few more sentences before this can be graded.</p>
      )}
    </div>
  );
}
