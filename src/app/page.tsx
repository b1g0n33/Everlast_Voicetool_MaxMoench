"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = "bereit" | "hoert_zu" | "verarbeitet" | "fertig" | "fehler";
type Mode = "smart_note" | "tasks" | "meeting_minutes" | "email";

type Enriched = {
  title: string;
  summaryBullets: string[];
  keyPoints: string[];
  decisions: string[];
  nextSteps: string[];
  markdown: string;
};

const APP_TITEL = "Voice Everlast";
const APP_UNTERTITEL = "Sprache → Transkript → strukturierter Output";

function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-white/70">
      <div className="h-3.5 w-3.5 rounded-full border border-white/25 border-t-white/90 animate-spin" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="opacity-80">
      <path
        fill="currentColor"
        d="M19.14,12.94a7.43,7.43,0,0,0,.05-.94,7.43,7.43,0,0,0-.05-.94l2.11-1.65a.5.5,0,0,0,.12-.63l-2-3.46a.5.5,0,0,0-.6-.22l-2.49,1a7.35,7.35,0,0,0-1.63-.94l-.38-2.65A.5.5,0,0,0,11.79,1H8.21a.5.5,0,0,0-.49.42L7.34,4.07a7.35,7.35,0,0,0-1.63.94l-2.49-1a.5.5,0,0,0-.6.22l-2,3.46a.5.5,0,0,0,.12.63L2.86,11.06a7.43,7.43,0,0,0-.05.94,7.43,7.43,0,0,0,.05.94L.75,14.59a.5.5,0,0,0-.12.63l2,3.46a.5.5,0,0,0,.6.22l2.49-1a7.35,7.35,0,0,0,1.63.94l.38,2.65a.5.5,0,0,0,.49.42h3.58a.5.5,0,0,0,.49-.42l.38-2.65a7.35,7.35,0,0,0,1.63-.94l2.49,1a.5.5,0,0,0,.6-.22l2-3.46a.5.5,0,0,0-.12-.63Zm-9.14,2.56A3.5,3.5,0,1,1,13.5,12,3.5,3.5,0,0,1,10,15.5Z"
      />
    </svg>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="text-sm font-medium">{title}</div>
          <button
            className="rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function isTypingTarget(el: EventTarget | null) {
  if (!el) return false;
  const node = el as HTMLElement;
  const tag = node.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((node as any).isContentEditable) return true;
  return false;
}

export default function Page() {
  const [status, setStatus] = useState<Status>("bereit");
  const [mode, setMode] = useState<Mode>("smart_note");

  const [apiKey, setApiKey] = useState("");
  const [hotkeyEnabled, setHotkeyEnabled] = useState(true);
  const [hotkey, setHotkey] = useState("Ctrl+Shift+Space");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [text, setText] = useState("");
  const [result, setResult] = useState<Enriched | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"transcript" | "output" | null>(null);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  // ✅ Wichtig: finaler Text-Puffer als REF (damit Reset wirklich alles leert)
  const finalTextRef = useRef("");

  const keyMissing = !apiKey.trim();

  useEffect(() => {
    try {
      const savedKey = localStorage.getItem("OPENAI_KEY") ?? "";
      const savedHotkey = localStorage.getItem("HOTKEY") ?? "Ctrl+Shift+Space";
      const savedEnabled = (localStorage.getItem("HOTKEY_ENABLED") ?? "true") === "true";

      setApiKey(savedKey);
      setHotkey(savedHotkey);
      setHotkeyEnabled(savedEnabled);

      invoke("configure_hotkey", { enabled: savedEnabled, shortcut: savedHotkey }).catch(() => {});
    } catch {}
  }, []);

  function saveKey(v: string) {
    setApiKey(v);
    try {
      localStorage.setItem("OPENAI_KEY", v);
    } catch {}
  }
  function saveHotkey(v: string) {
    setHotkey(v);
    try {
      localStorage.setItem("HOTKEY", v);
    } catch {}
  }
  function saveHotkeyEnabled(v: boolean) {
    setHotkeyEnabled(v);
    try {
      localStorage.setItem("HOTKEY_ENABLED", String(v));
    } catch {}
  }

  async function applyHotkey() {
    setError("");
    try {
      await invoke("configure_hotkey", { enabled: hotkeyEnabled, shortcut: hotkey });
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("fehler");
    }
  }

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("SpeechRecognition ist hier nicht verfügbar.");
      setStatus("fehler");
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "de-DE";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    // ✅ initialisieren
    finalTextRef.current = "";

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finalTextRef.current += t;
        else interim += t;
      }
      setText((finalTextRef.current + interim).trim());
    };

    rec.onerror = (e: any) => {
      setError(e?.error ? String(e.error) : "Unbekannter Speech-Fehler");
      setStatus("fehler");
      isListeningRef.current = false;
    };

    rec.onend = () => {
      if (isListeningRef.current) {
        try {
          rec.start();
        } catch {}
      }
    };

    recognitionRef.current = rec;

    return () => {
      try {
        isListeningRef.current = false;
        rec.stop();
      } catch {}
    };
  }, []);

  function start() {
    setError("");
    setText("");
    setResult(null);
    setCopied(null);

    // ✅ ganz wichtig: Buffer resetten
    finalTextRef.current = "";

    setStatus("hoert_zu");
    isListeningRef.current = true;

    try {
      recognitionRef.current?.start();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("fehler");
      isListeningRef.current = false;
    }
  }

  function stop() {
    try {
      isListeningRef.current = false;
      recognitionRef.current?.stop();
      setStatus("fertig");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("fehler");
    }
  }

  // ✅ Reset: nur Arbeitsdaten zurücksetzen (Transkript + Output + Error), NICHT Settings
  function reset() {
    setError("");
    setText("");
    setResult(null);
    setCopied(null);
    setStatus("bereit");

    // ✅ Buffer reset
    finalTextRef.current = "";

    // ✅ harte Beendigung, damit nichts "nachtröpfelt"
    try {
      isListeningRef.current = false;
      recognitionRef.current?.abort?.();
    } catch {}
  }

  async function enrich() {
    if (!text.trim()) return;

    setError("");
    setResult(null);
    setCopied(null);
    setStatus("verarbeitet");

    try {
      const data = (await invoke("enrich", {
        apiKey: apiKey,
        text,
        mode,
      })) as any;

      const safe: Enriched = {
        title: data?.title ?? "Output",
        summaryBullets: Array.isArray(data?.summaryBullets) ? data.summaryBullets : [],
        keyPoints: Array.isArray(data?.keyPoints) ? data.keyPoints : [],
        decisions: Array.isArray(data?.decisions) ? data.decisions : [],
        nextSteps: Array.isArray(data?.nextSteps) ? data.nextSteps : [],
        markdown: typeof data?.markdown === "string" ? data.markdown : "",
      };

      setResult(safe);
      setStatus("fertig");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus("fehler");
    }
  }

  async function copyTranscript() {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setCopied("transcript");
    setTimeout(() => setCopied(null), 1200);
  }

  async function copyOutput() {
    if (!result?.markdown) return;
    await navigator.clipboard.writeText(result.markdown);
    setCopied("output");
    setTimeout(() => setCopied(null), 1200);
  }

  const canProcess =
    !!text.trim() && !!apiKey.trim() && status !== "hoert_zu" && status !== "verarbeitet";

  const statusLabel = useMemo(() => {
    if (status === "bereit") return "Bereit";
    if (status === "hoert_zu") return "Hört zu…";
    if (status === "verarbeitet") return "Verarbeitet…";
    if (status === "fertig") return "Fertig";
    return "Fehler";
  }, [status]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.key === "Escape") {
        if (settingsOpen) {
          e.preventDefault();
          setSettingsOpen(false);
          return;
        }
        if (status === "hoert_zu") {
          e.preventDefault();
          stop();
        }
        return;
      }

      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (canProcess) enrich();
        return;
      }

      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (settingsOpen) return;
        e.preventDefault();
        if (status === "hoert_zu") stop();
        else if (status !== "verarbeitet") start();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, status, canProcess, apiKey, text, mode]);

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-white/10 bg-white/5 shadow-2xl overflow-hidden">
          <div className="px-8 py-7">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight">{APP_TITEL}</h1>
                <div className="text-sm text-white/60">{APP_UNTERTITEL}</div>
              </div>

              <div className="flex items-center gap-3">
                {status === "hoert_zu" && <Spinner label="Aufnahme" />}
                {status === "verarbeitet" && <Spinner label="KI arbeitet" />}
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
                  <span className="text-white/50">●</span>
                  <span>{statusLabel}</span>
                </div>

                <button
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                  onClick={() => setSettingsOpen(true)}
                  title="Einstellungen"
                >
                  <span className="inline-flex items-center gap-2">
                    <IconGear /> Einstellungen
                  </span>
                </button>
              </div>
            </div>

            {keyMissing && (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-white/80">
                API-Key fehlt – öffne <span className="font-medium">Einstellungen</span>, um ihn zu setzen.
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <select
                className="rounded-xl bg-neutral-900/80 text-white border border-white/15 px-4 py-3 text-sm outline-none focus:border-white/30"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                disabled={status === "hoert_zu" || status === "verarbeitet"}
              >
                <option value="smart_note">Smart Note</option>
                <option value="tasks">Aufgaben</option>
                <option value="meeting_minutes">Meeting-Notizen</option>
                <option value="email">E-Mail Entwurf</option>
              </select>

              <button
                className="rounded-xl bg-white text-black px-5 py-3 text-sm font-medium disabled:opacity-40"
                onClick={start}
                disabled={status === "hoert_zu" || status === "verarbeitet"}
                title="Enter"
              >
                Start
              </button>

              <button
                className="rounded-xl bg-white/10 border border-white/15 px-5 py-3 text-sm text-white/85 disabled:opacity-40"
                onClick={stop}
                disabled={status !== "hoert_zu"}
                title="Esc / Enter"
              >
                Stop
              </button>

              <button
                className="rounded-xl bg-white/10 border border-white/15 px-5 py-3 text-sm text-white/85 disabled:opacity-40"
                onClick={enrich}
                disabled={!canProcess}
                title={!apiKey.trim() ? "Setze zuerst einen API-Key in den Einstellungen" : "Ctrl+Enter"}
              >
                Transkript verarbeiten
              </button>

              <button
                className="rounded-xl px-5 py-3 text-sm text-white/60 hover:text-white/80"
                onClick={reset}
              >
                Zurücksetzen
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-white/90 whitespace-pre-wrap">
                <div className="font-medium mb-1">Fehler</div>
                {error}
              </div>
            )}
          </div>

          <div className="grid gap-4 border-t border-white/10 bg-black/20 px-8 py-7 md:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Transkript</div>

                <div className="flex items-center gap-2">
                  {status === "hoert_zu" && <Spinner />}
                  <button
                    onClick={copyTranscript}
                    className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-xs text-white/80 disabled:opacity-40"
                    disabled={!text.trim()}
                  >
                    {copied === "transcript" ? "Kopiert ✓" : "Kopieren"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {text ? (
                  <div className="text-lg leading-relaxed whitespace-pre-wrap">{text}</div>
                ) : (
                  <div className="text-sm text-white/55">Noch kein Transkript.</div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Output</div>

                <div className="flex items-center gap-2">
                  {status === "verarbeitet" && <Spinner />}
                  <button
                    onClick={copyOutput}
                    className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-xs text-white/80 disabled:opacity-40"
                    disabled={!result?.markdown}
                  >
                    {copied === "output" ? "Kopiert ✓" : "Kopieren"}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {result?.markdown ? (
                  <pre className="text-sm whitespace-pre-wrap leading-relaxed">{result.markdown}</pre>
                ) : (
                  <div className="text-sm text-white/55">Noch kein Output.</div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-4 text-xs text-white/40 leading-relaxed space-y-1">
  <div>
    <span className="text-white/60 font-medium">Tastenkürzel:</span>{" "}
    <span className="text-white/70">Enter</span> = Aufnahme starten / stoppen ·{" "}
    <span className="text-white/70">Ctrl + Enter</span> = Transkript verarbeiten ·{" "}
    <span className="text-white/70">Esc</span> = Aufnahme abbrechen oder Einstellungen schließen
  </div>

  <div>
    <span className="text-white/60 font-medium">Globaler Hotkey:</span>{" "}
    <span className="text-white/70">Ctrl + Shift + Space</span> = App ein-/ausblenden
  </div>
</div>


        <Modal open={settingsOpen} title="Einstellungen" onClose={() => setSettingsOpen(false)}>
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-sm font-medium">OpenAI API-Key</div>
              <div className="text-xs text-white/50">Wird lokal auf diesem Gerät gespeichert.</div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => saveKey(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-xl bg-neutral-900/80 text-white border border-white/15 px-4 py-3 text-sm outline-none focus:border-white/30"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Globaler Hotkey</div>
                  <div className="text-xs text-white/50">Standard: Ctrl+Shift+Space</div>
                </div>

                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input
                    type="checkbox"
                    checked={hotkeyEnabled}
                    onChange={(e) => saveHotkeyEnabled(e.target.checked)}
                  />
                  Aktiv
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  value={hotkey}
                  onChange={(e) => saveHotkey(e.target.value)}
                  placeholder="Ctrl+Shift+Space"
                  className="flex-1 min-w-[220px] rounded-xl bg-neutral-900/80 text-white border border-white/15 px-4 py-3 text-sm outline-none focus:border-white/30"
                />
                <button
                  onClick={applyHotkey}
                  className="rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-sm text-white/80 hover:bg-white/15 active:bg-white/10"
                >
                  Anwenden
                </button>
              </div>

              <div className="text-xs text-white/45">
                Beispiele: Ctrl+Alt+V · Alt+Space · Ctrl+Shift+K
              </div>
            </div>

            <div className="text-xs text-white/45">
              Shortcuts: <span className="text-white/70">Enter</span> Start/Stop ·{" "}
              <span className="text-white/70">Esc</span> Stop/Schließen ·{" "}
              <span className="text-white/70">Ctrl+Enter</span> Verarbeiten
            </div>
          </div>
        </Modal>
      </div>
    </main>
  );
}
