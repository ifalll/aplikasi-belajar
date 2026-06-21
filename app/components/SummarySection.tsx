"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Flashcard } from "../page";

type Message = { role: "user" | "assistant"; content: string };
type TtsState = "idle" | "playing" | "paused";

const SPEED_OPTIONS = [0.75, 0.9, 1.0, 1.15, 1.35];
const SPEED_LABELS: Record<number, string> = {
  0.75: "Lambat",
  0.9: "Normal",
  1.0: "Standar",
  1.15: "Cepat",
  1.35: "Sangat Cepat",
};

export default function SummarySection({
  text,
  flashcards,
}: {
  text: string;
  flashcards: Flashcard[];
}) {
  // ─── TTS ──────────────────────────────────────────────────
  const [ttsState, setTtsState] = useState<TtsState>("idle");
  const [ttsSpeed, setTtsSpeed] = useState(0.9);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsSpeedRef = useRef(ttsSpeed);
  ttsSpeedRef.current = ttsSpeed;

  // ─── Chat ─────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [contextParagraph, setContextParagraph] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // ─── UI ───────────────────────────────────────────────────
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  // ─── Load voices ──────────────────────────────────────────
  useEffect(() => {
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (!v.length) return;
      setVoices(v);
      setSelectedVoice((prev) => {
        if (prev) return prev;
        
        // Prioritas 1: Suara Microsoft Edge "Natural" (Paling jernih dan manusiawi)
        const edgeNatural = v.find((x) => x.lang.startsWith("id") && x.name.includes("Natural"));
        if (edgeNatural) return edgeNatural;

        // Prioritas 2: Suara Google Bahasa Indonesia (Bawaan Chrome)
        const googleId = v.find((x) => x.lang.startsWith("id") && x.name.toLowerCase().includes("google"));
        if (googleId) return googleId;

        // Prioritas 3: Suara lokal Indonesia bawaan OS (Microsoft Andika/Gadis, dll)
        const localId = v.find((x) => x.lang === "id-ID" || x.lang === "id_ID");
        if (localId) return localId;

        // Fallback: Cari suara apa saja yang ada tag 'id'
        return v.find((x) => x.lang.startsWith("id")) || null;
      });
    };
    
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Close speed menu on outside click
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSpeedMenu]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatLoading]);

  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [chatOpen]);

  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [showSearch]);

  // ─── TTS controls ─────────────────────────────────────────
  const startPodcast = useCallback(
    (speed?: number) => {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      if (selectedVoice) utter.voice = selectedVoice;
      utter.lang = "id-ID";
      utter.rate = speed ?? ttsSpeedRef.current;
      utter.pitch = 1.0;

      const total = text.length;
      let keepAliveInterval: NodeJS.Timeout;

      utter.onstart = () => {
        // Trik Keep-Alive untuk mencegah browser mematikan TTS setelah 15 detik
        keepAliveInterval = setInterval(() => {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }, 14000);
      };

      utter.onboundary = (e) => {
        setReadProgress(Math.min(99, Math.round((e.charIndex / total) * 100)));
      };
      
      utter.onend = () => {
        clearInterval(keepAliveInterval);
        setTtsState("idle");
        setReadProgress(0);
      };
      
      utter.onerror = (e) => {
        clearInterval(keepAliveInterval);
        if (e.error !== "interrupted") {
          setTtsState("idle");
          setReadProgress(0);
        }
      };

      utterRef.current = utter;
      window.speechSynthesis.speak(utter);
      setTtsState("playing");
    },
    [text, selectedVoice]
  );

  const togglePause = useCallback(() => {
    if (ttsState === "playing") {
      window.speechSynthesis.pause();
      setTtsState("paused");
    } else if (ttsState === "paused") {
      window.speechSynthesis.resume();
      setTtsState("playing");
    }
  }, [ttsState]);

  const stopPodcast = useCallback(() => {
    window.speechSynthesis.cancel();
    setTtsState("idle");
    setReadProgress(0);
  }, []);

  const handleSpeedChange = (s: number) => {
    setTtsSpeed(s);
    setShowSpeedMenu(false);
    if (ttsState !== "idle") {
      window.speechSynthesis.cancel();
      setTimeout(() => startPodcast(s), 80);
    }
  };

  // ─── Chat ─────────────────────────────────────────────────
  function openChat(paragraph?: string) {
    setContextParagraph(paragraph ?? null);
    setMessages([]);
    setChatError(null);
    setChatOpen(true);
  }

  async function sendMessage() {
    const userMsg = input.trim();
    if (!userMsg || isChatLoading) return;
    setChatError(null);

    const newMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: contextParagraph ?? text.substring(0, 3000),
          message: userMsg,
          history: messages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Gagal terhubung ke server.");
      }

      setMessages([
        ...newMessages,
        { role: "assistant", content: data.reply ?? "Maaf, tidak ada jawaban." },
      ]);
    } catch (e: any) {
      const errMsg = e.message ?? "Koneksi gagal. Coba lagi ya 🙏";
      setChatError(errMsg);
      setMessages([...newMessages, { role: "assistant", content: errMsg }]);
    } finally {
      setIsChatLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ─── Utils ────────────────────────────────────────────────
  const copyParagraph = useCallback((t: string, idx: number) => {
    navigator.clipboard.writeText(t).then(() => {
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }, []);

  const exportText = () => {
    setIsExporting(true);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rangkuman-stuby.txt";
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setIsExporting(false), 1200);
  };

  const highlightText = useCallback(
    (paragraph: string) => {
      let result = paragraph;

      // Flashcard keyword highlights
      const sorted = [...flashcards].sort((a, b) => b.depan.length - a.depan.length);
      sorted.forEach((card) => {
        const escaped = card.depan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b(${escaped})\\b`, "gi");
        result = result.replace(
          regex,
          `<span class="keyword-tooltip inline">` +
            `<mark class="bg-pink-100 text-pink-800 px-0.5 py-0.5 rounded font-semibold cursor-help border-b-2 border-pink-300 not-italic">$1</mark>` +
            `<span class="tooltip-content"><strong>${card.depan}</strong><br/>${card.belakang}</span>` +
            `</span>`
        );
      });

      // Search highlighting (on top of flashcard highlights)
      if (searchQuery.trim()) {
        const sq = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        result = result.replace(
          new RegExp(`(${sq})(?![^<]*>)`, "gi"),
          `<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5 not-italic">$1</mark>`
        );
      }

      return result;
    },
    [flashcards, searchQuery]
  );

  const paragraphs = text.split("\n").filter((p) => p.trim());
  const filteredParagraphs = searchQuery.trim()
    ? paragraphs.filter((p) => p.toLowerCase().includes(searchQuery.toLowerCase()))
    : paragraphs;

  const readTimeMin = Math.max(1, Math.ceil(text.split(/\s+/).length / 200));
  const voiceDisplayName = selectedVoice
    ? selectedVoice.name
        .replace(/Google /gi, "")
        .replace(/Microsoft /gi, "")
        .split(" (")[0]
    : null;

  // ─── RENDER ───────────────────────────────────────────────
  return (
    <div className="p-6 sm:p-10">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8 pb-6 border-b border-pink-50">
        <div>
          <h2 className="text-xl font-black text-gray-800">Catatan Pintar</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <mark className="bg-pink-100 text-pink-700 px-1 rounded text-[11px] font-semibold not-italic">
                Kata bergaris bawah
              </mark>
              → hover untuk definisi
            </span>
            <span className="text-gray-300 text-xs hidden sm:inline">·</span>
            <span className="text-xs text-gray-400">⏱ ~{readTimeMin} menit baca</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search toggle */}
          <button
            onClick={() => {
              setShowSearch((v) => !v);
              if (showSearch) setSearchQuery("");
            }}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
              showSearch
                ? "bg-pink-50 text-pink-600 border-pink-200"
                : "bg-gray-50 text-gray-500 border-gray-200 hover:border-pink-200 hover:text-pink-500"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <span className="hidden sm:inline">Cari</span>
          </button>

          {/* Export */}
          <button
            onClick={exportText}
            disabled={isExporting}
            title="Ekspor sebagai teks"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-50 text-gray-500 border border-gray-200 hover:border-pink-200 hover:text-pink-500 transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            <span className="hidden sm:inline">{isExporting ? "Mengekspor..." : "Ekspor"}</span>
          </button>

          {/* Chat */}
          <button
            onClick={() => openChat()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-pink-50 text-pink-600 border border-pink-200/80 hover:bg-pink-100 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            Tanya Stuby
          </button>

          {/* TTS group */}
          <div className="flex items-center gap-1">
            {ttsState === "idle" ? (
              <button
                onClick={() => startPodcast()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:shadow-lg hover:shadow-pink-300/40 hover:-translate-y-0.5 active:translate-y-0 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
                Dengarkan
              </button>
            ) : (
              <>
                <button
                  onClick={togglePause}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold bg-pink-500 text-white hover:bg-pink-600 transition-all"
                >
                  {ttsState === "playing" ? (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                      </svg>
                      Jeda
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Lanjut
                    </>
                  )}
                </button>
                <button
                  onClick={stopPodcast}
                  title="Stop"
                  className="p-2.5 rounded-xl bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 transition-all"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              </>
            )}

            {/* Speed */}
            <div className="relative" ref={speedMenuRef}>
              <button
                onClick={() => setShowSpeedMenu((v) => !v)}
                className="px-2.5 py-2.5 rounded-xl text-xs font-black text-gray-500 bg-gray-50 border border-gray-200 hover:border-pink-300 hover:text-pink-600 transition-all min-w-[44px] text-center"
              >
                {ttsSpeed}×
              </button>
              {showSpeedMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl border border-gray-100 shadow-xl z-30 overflow-hidden w-40 animate-in fade-in slide-in-from-top-2 duration-150">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={`flex items-center justify-between w-full px-4 py-2.5 text-sm transition-colors ${
                        ttsSpeed === s
                          ? "bg-pink-50 text-pink-600 font-black"
                          : "text-gray-600 hover:bg-gray-50 font-semibold"
                      }`}
                    >
                      <span>{s}×</span>
                      <span className="text-[10px] opacity-60">{SPEED_LABELS[s]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TTS Progress ──────────────────────────────────── */}
      {ttsState !== "idle" && (
        <div className="mb-6 bg-gradient-to-r from-pink-50 to-rose-50 rounded-2xl p-4 border border-pink-100 animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5">
              {ttsState === "playing" ? (
                <div className="flex gap-0.5 items-end h-5">
                  {[3, 5, 8, 6, 4].map((h, i) => (
                    <div
                      key={i}
                      className="w-1 bg-pink-500 rounded-full animate-pulse"
                      style={{
                        height: `${h * 2}px`,
                        animationDelay: `${i * 0.12}s`,
                        animationDuration: "0.8s",
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
              )}
              <span className="text-sm font-bold text-pink-700">
                {ttsState === "playing" ? "🎙️ Sedang dibacakan..." : "⏸️ Dijeda"}
              </span>
            </div>
            <span className="text-sm font-black text-pink-500">{readProgress}%</span>
          </div>
          <div className="h-2 bg-pink-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(2, readProgress)}%` }}
            />
          </div>
          {voiceDisplayName && (
            <p className="text-[11px] text-pink-400 mt-2 font-medium">
              🎤 {voiceDisplayName} · {ttsSpeed}× kecepatan
            </p>
          )}
          {!selectedVoice && voices.length > 0 && (
            <p className="text-[11px] text-amber-500 mt-2 font-medium">
              ⚠️ Suara Indonesia tidak ditemukan, menggunakan suara default
            </p>
          )}
        </div>
      )}

      {/* ── Search bar ────────────────────────────────────── */}
      {showSearch && (
        <div className="mb-5 animate-in slide-in-from-top-3 fade-in duration-200">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kata atau kalimat dalam rangkuman..."
              className="w-full px-4 py-3 pl-10 rounded-2xl border border-pink-200 focus:border-pink-400 focus:ring-2 focus:ring-pink-100 text-sm text-gray-700 outline-none transition-all bg-pink-50/30"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-gray-400 mt-2 ml-1 font-medium">
              {filteredParagraphs.length === 0
                ? "⚠️ Tidak ditemukan."
                : `✅ ${filteredParagraphs.length} paragraf mengandung "${searchQuery}"`}
            </p>
          )}
        </div>
      )}

      {/* ── Paragraphs ────────────────────────────────────── */}
      <div className="space-y-3 text-gray-700 text-[16px] sm:text-[16.5px] leading-[1.85]">
        {filteredParagraphs.map((p, i) => (
          <div key={i} className="group relative">
            <p
              className="px-5 py-4 rounded-2xl border border-transparent hover:bg-pink-50/50 hover:border-pink-100 transition-all duration-200 cursor-default"
              dangerouslySetInnerHTML={{ __html: highlightText(p) }}
            />
            <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={() => copyParagraph(p, i)}
                title="Salin paragraf"
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-100 shadow-sm text-gray-400 hover:text-pink-500 hover:border-pink-200 transition-all"
              >
                {copiedIndex === i ? (
                  <span className="text-green-500 text-xs font-black">✓</span>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => openChat(p)}
                title="Tanya Stuby tentang ini"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-pink-500 text-white text-[10px] font-bold shadow-sm hover:bg-pink-600 active:scale-95 transition-all"
              >
                ❓ Tanya
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Stats bar ─────────────────────────────────────── */}
      <div className="mt-8 pt-6 border-t border-pink-50 flex flex-wrap gap-3">
        {[
          { label: "Paragraf", value: paragraphs.length, icon: "📝" },
          { label: "Kata", value: text.split(/\s+/).length.toLocaleString("id"), icon: "📊" },
          { label: "Istilah", value: flashcards.length, icon: "🃏" },
          { label: "Waktu baca", value: `~${readTimeMin} mnt`, icon: "⏱" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 bg-pink-50 px-4 py-2.5 rounded-xl border border-pink-100/80">
            <span className="text-base">{s.icon}</span>
            <div>
              <p className="font-black text-pink-600 text-base leading-none">{s.value}</p>
              <p className="text-[10px] text-pink-400 font-medium mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Chat Modal ────────────────────────────────────── */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setChatOpen(false);
          }}
        >
          <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border border-pink-100 max-h-[88vh] animate-in slide-in-from-bottom-8 fade-in duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-pink-50 flex-shrink-0 bg-gradient-to-r from-pink-50 via-white to-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white font-black shadow-md shadow-pink-200">
                  S
                </div>
                <div>
                  <p className="font-black text-gray-800 text-sm">Tanya Stuby</p>
                  <p className="text-[10px] text-pink-400 font-medium">
                    {contextParagraph ? "📌 Dari paragraf yang dipilih" : "💬 Dari keseluruhan materi"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={() => { setMessages([]); setChatError(null); }}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-all font-semibold"
                  >
                    Bersihkan
                  </button>
                )}
                <button
                  onClick={() => setChatOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 min-h-[200px]">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <div className="text-4xl mb-3 animate-bounce">🤔</div>
                  <p className="text-sm text-gray-500 font-semibold mb-1">Tanyakan apa saja tentang materi ini</p>
                  <p className="text-xs text-gray-400 mb-5">Stuby akan menjawab berdasarkan konteks yang dipilih</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[
                      "Jelaskan lebih sederhana",
                      "Beri contoh nyata",
                      "Apa poin utamanya?",
                      "Buat soal dari ini",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="text-xs px-3 py-1.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100 hover:bg-pink-100 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 mt-0.5">
                      S
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-pink-500 to-rose-500 text-white rounded-br-sm"
                        : "bg-gray-50 text-gray-700 rounded-bl-sm border border-gray-100"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                    S
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3.5 flex gap-1.5 items-center">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-pink-300 bounce-dot" />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-4 pt-3 border-t border-pink-50 flex-shrink-0">
              <div className="flex gap-2 items-end bg-gray-50 rounded-2xl border border-gray-100 focus-within:border-pink-300 focus-within:bg-white transition-all p-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ketik pertanyaan… (Enter kirim, Shift+Enter baris baru)"
                  rows={1}
                  className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-300 resize-none outline-none max-h-28 min-h-[20px] leading-relaxed"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                  disabled={isChatLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isChatLoading}
                  className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-pink-500 text-white disabled:opacity-30 hover:bg-pink-600 active:scale-90 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}