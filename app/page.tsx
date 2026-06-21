"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import QuizSection from "./components/QuizSection";
import FlashcardSection from "./components/FlashcardSection";
import SummarySection from "./components/SummarySection";

export type QuizItem = {
  pertanyaan: string;
  pilihan: string[];
  jawaban_benar: string;
  penjelasan: string;
};

export type Flashcard = {
  depan: string;
  belakang: string;
};

export type ResultData = {
  judul_materi: string;
  rangkuman: string;
  kuis: QuizItem[];
  flashcards: Flashcard[];
};

type Tab = "rangkuman" | "kuis" | "flashcard";

const MAX_FILE_SIZE_MB = 15;

const LOADING_STEPS = [
  { icon: "📄", text: "Membaca isi dokumen..." },
  { icon: "🧠", text: "Memahami konteks materi..." },
  { icon: "✍️", text: "Menyusun rangkuman cerdas..." },
  { icon: "🎮", text: "Membuat 35 soal kuis..." },
  { icon: "🃏", text: "Menyiapkan flashcard pintar..." },
  { icon: "✨", text: "Sentuhan akhir..." },
];

const FILE_ICONS: Record<string, string> = {
  ".pdf": "📄",
  ".docx": "📝",
  ".pptx": "📊",
  ".odt": "📝",
  ".odp": "📊",
};

function getFileIcon(name: string) {
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  return FILE_ICONS[ext] ?? "📁";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("rangkuman");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading simulation
  useEffect(() => {
    if (!isLoading) {
      setUploadProgress(0);
      setLoadingStep(0);
      return;
    }

    const stepInterval = setInterval(() => {
      setLoadingStep((p) => (p < LOADING_STEPS.length - 1 ? p + 1 : p));
    }, 6500);

    const progressInterval = setInterval(() => {
      setUploadProgress((old) => {
        const increment = old < 30 ? 4 : old < 60 ? 2.5 : old < 80 ? 1.5 : 0.5;
        const next = old + increment + Math.random() * 1.5;
        return next < 91 ? next : 91;
      });
    }, 800);

    return () => {
      clearInterval(stepInterval);
      clearInterval(progressInterval);
    };
  }, [isLoading]);

  // Auto-dismiss error
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const validateFile = useCallback((file: File): string | null => {
    const allowed = [".pdf", ".docx", ".pptx", ".odt", ".odp"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext))
      return "Format tidak didukung. Gunakan PDF, Word (DOCX), atau PowerPoint (PPTX).";
    if (file.size / (1024 * 1024) > MAX_FILE_SIZE_MB)
      return `File terlalu besar. Maksimal ${MAX_FILE_SIZE_MB}MB.`;
    if (file.size === 0) return "File kosong atau rusak.";
    return null;
  }, []);

  const applyFile = useCallback(
    (file: File) => {
      const err = validateFile(file);
      if (err) {
        setError(err);
        return;
      }
      setSelectedFile(file);
      setResult(null);
      setError(null);
    },
    [validateFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
    e.target.value = "";
  };

  const handleDragEvent = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    else setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) applyFile(f);
    },
    [applyFile]
  );

  const handleSubmit = async () => {
    if (!selectedFile || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Eksekusi Rangkuman (Prioritas Utama)
      const fdSummary = new FormData();
      fdSummary.append("file", selectedFile);
      fdSummary.append("action", "summary"); // Parameter action

      const resSummary = await fetch("/api/process", { method: "POST", body: fdSummary });
      if (!resSummary.ok) throw new Error("Gagal membuat rangkuman. Periksa ukuran file atau koneksimu.");
      const dataSummary = await resSummary.json();

      // Tampilkan Workspace SEKARANG JUGA! Kuis & Flashcard diset kosong dulu
      setUploadProgress(100);
      setResult({
        judul_materi: dataSummary.judul_materi,
        rangkuman: dataSummary.rangkuman,
        kuis: [],
        flashcards: []
      });
      setActiveTab("rangkuman");
      setIsLoading(false); // Matikan loading screen utama

      // 2. Eksekusi Kuis dan Flashcard secara Paralel di Belakang Layar
      const fdQuiz = new FormData();
      fdQuiz.append("file", selectedFile);
      fdQuiz.append("action", "quiz");

      const fdFlash = new FormData();
      fdFlash.append("file", selectedFile);
      fdFlash.append("action", "flashcard");

      Promise.all([
        fetch("/api/process", { method: "POST", body: fdQuiz }).then(r => r.ok ? r.json() : { kuis: [] }),
        fetch("/api/process", { method: "POST", body: fdFlash }).then(r => r.ok ? r.json() : { flashcards: [] })
      ]).then(([quizData, flashData]) => {
        // Update state secara diam-diam setelah selesai
        setResult(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            kuis: quizData.kuis || [],
            flashcards: flashData.flashcards || []
          };
        });
      }).catch(err => console.error("Gagal load kuis/flashcard background", err));

    } catch (err: any) {
      setError(err.message ?? "Terjadi kesalahan. Silakan coba lagi.");
      setIsLoading(false);
    }
  };

  // ─── WORKSPACE SCREEN ─────────────────────────────────────
  if (result) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-[#fff0f6] via-[#fff5f8] to-[#fff0ec] px-4 py-8 sm:py-12 font-sans">
        {/* Ambient background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-8%] right-[-8%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] rounded-full bg-pink-300/25 blur-[100px] animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute bottom-[-10%] left-[-6%] w-[35vw] h-[35vw] max-w-[420px] max-h-[420px] rounded-full bg-rose-200/30 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_reverse]" />
        </div>

        <div className="mx-auto w-full max-w-5xl relative z-10 space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/85 backdrop-blur-xl px-5 sm:px-7 py-4 sm:py-5 rounded-3xl border border-pink-100/60 shadow-sm">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center shadow-md shadow-pink-200/50">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black tracking-[0.2em] uppercase text-pink-400">Workspace Aktif</p>
                <h1 className="text-lg sm:text-2xl font-black text-gray-900 truncate">
                  {result.judul_materi}
                </h1>
              </div>
            </div>
            <button
              onClick={() => { setResult(null); setSelectedFile(null); }}
              className="group flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 border-2 border-gray-100 hover:border-pink-200 hover:text-pink-600 hover:bg-pink-50/60 transition-all duration-200"
            >
              <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Unggah Baru
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex gap-2 bg-white/70 backdrop-blur-md p-2 rounded-2xl border border-white/80 shadow-sm">
            {(
              [
                { key: "rangkuman", icon: "📝", label: "Catatan", sub: "Rangkuman" },
                { key: "kuis", icon: "🎮", label: "Kuis", sub: `${result.kuis.length} soal` },
                { key: "flashcard", icon: "🃏", label: "Flashcard", sub: `${result.flashcards.length} kartu` },
              ] as const
            ).map(({ key, icon, label, sub }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`relative flex-1 flex flex-col items-center py-3 px-3 rounded-xl text-xs font-black transition-all duration-300 ${
                  activeTab === key
                    ? "bg-white shadow-sm text-pink-600 border border-pink-100/80 scale-100"
                    : "text-gray-400 hover:text-gray-600 hover:bg-white/50 scale-95"
                }`}
              >
                <span className="text-xl mb-1">{icon}</span>
                <span className="text-sm leading-tight">{label}</span>
                <span className={`text-[10px] font-medium mt-0.5 ${activeTab === key ? "text-pink-400" : "text-gray-400"}`}>
                  {sub}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="rounded-[2.5rem] bg-white border border-pink-50 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-500">
            {/* Tab Rangkuman */}
            <div className={activeTab === "rangkuman" ? "block" : "hidden"}>
              <SummarySection text={result.rangkuman} flashcards={result.flashcards} />
            </div>
            
            {/* Tab Kuis */}
            <div className={activeTab === "kuis" ? "block" : "hidden"}>
              {result.kuis.length > 0 ? (
                <QuizSection questions={result.kuis} />
              ) : (
                <div className="p-16 text-center text-pink-500 animate-pulse font-bold">
                  <span className="text-4xl block mb-4">⚙️</span>
                  Stuby sedang menyusun 35 soal buat kamu...
                </div>
              )}
            </div>
            
            {/* Tab Flashcard */}
            <div className={activeTab === "flashcard" ? "block" : "hidden"}>
              {result.flashcards.length > 0 ? (
                <FlashcardSection cards={result.flashcards} />
              ) : (
                <div className="p-16 text-center text-pink-500 animate-pulse font-bold">
                  <span className="text-4xl block mb-4">🃏</span>
                  Stuby sedang menyiapkan flashcard...
                </div>
              )}
            </div>
          </div>
          </div>
      </main>
    );
  }

  // ─── HERO / UPLOAD SCREEN ─────────────────────────────────
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fff0f6] font-sans">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[60vw] h-[60vw] max-w-[700px] max-h-[700px] rounded-full bg-pink-300/25 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute -bottom-24 -right-24 w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-rose-200/30 blur-[120px] animate-[pulse_10s_ease-in-out_infinite_reverse]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#f43f5e_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-20 w-full border-b border-white/50 bg-white/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg shadow-pink-400/20">
              <span className="text-white font-black text-xl">S</span>
            </div>
            <span className="text-xl font-black tracking-tight text-gray-800">
              Stuby<span className="text-pink-500">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 shadow-sm border border-pink-100/80">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-70" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500" />
            </span>
            <span className="text-[11px] font-black text-pink-500 uppercase tracking-[0.15em] ml-1">
              For Sabby 💕
            </span>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-16 lg:py-24">
        <div className="w-full max-w-7xl grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* ── Left: Hero copy ──────────────────────────── */}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-pink-50 border border-pink-200/80 mb-7 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
              <span className="text-base"></span>
              <span className="text-xs font-black uppercase tracking-[0.15em] text-pink-600">
                Belajar Cerdas Bareng Stuby
              </span>
            </div>

            <h1 className="text-5xl lg:text-[3.8rem] font-black leading-[1.06] tracking-tight text-gray-900 mb-6 animate-in fade-in slide-in-from-bottom-5 duration-700 delay-100">
              Aplikasi Buat{" "}
              <br className="hidden lg:block" />
              Bantu{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-rose-500 to-pink-400">
                  Belajar Kamu.
                </span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  viewBox="0 0 200 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M2 8C50 2 100 2 198 8" stroke="#fda4af" strokeWidth="3.5" strokeLinecap="round" />
                </svg>
              </span>
            </h1>

            <p className="text-gray-500 text-lg leading-relaxed mb-10 font-medium animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
              Upload PDF, Word, atau PowerPoint materi kamu. Biarkan Stuby merangkum, membuat 35 soal kuis, dan menyusun flashcard — otomatis dalam hitungan detik.
            </p>

            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-7 duration-700 delay-300">
              {[
                {
                  emoji: "📝",
                  title: "Rangkuman + Podcast Mode",
                  desc: "Rangkuman lengkap dengan highlight istilah, text-to-speech, dan fitur tanya-jawab.",
                },
                {
                  emoji: "🎮",
                  title: "35 Soal Kuis",
                  desc: "Kuis pilihan ganda bertingkat dengan navigasi soal, timer, dan evaluasi jawaban real-time.",
                },
                {
                  emoji: "🃏",
                  title: "Flashcard Buat Kamu Ngapalin",
                  desc: "Sistem 3 level (Hafal · Ragu · Susah).",
                },
              ].map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-5 group p-2.5 hover:bg-white/50 rounded-2xl transition-colors"
                >
                  <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center text-2xl bg-white rounded-2xl shadow-sm border border-pink-50 group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
                    {f.emoji}
                  </div>
                  <div>
                    <p className="font-black text-gray-800 text-base">{f.title}</p>
                    <p className="text-gray-400 text-sm leading-snug font-medium">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Upload card ───────────────────────── */}
          <div className="relative animate-in zoom-in-95 duration-700 delay-300">
            <div className="absolute -inset-4 rounded-[3rem] bg-gradient-to-br from-pink-200/40 to-rose-100/30 blur-3xl" />
            <div className="relative bg-white/90 backdrop-blur-2xl rounded-[2.5rem] p-8 sm:p-10 shadow-2xl shadow-pink-100/40 border border-white">

              <div className="mb-7 text-center">
                <h2 className="text-2xl font-black text-gray-800 mb-1.5">Mulai Sekarang</h2>
                <p className="text-sm font-bold text-pink-400 uppercase tracking-widest">
                  Upload → Analisis → Belajar 
                </p>
              </div>

              {/* Drop zone */}
              <div
                onDragEnter={handleDragEvent}
                onDragOver={handleDragEvent}
                onDragLeave={handleDragEvent}
                onDrop={handleDrop}
                onClick={() => !isLoading && fileInputRef.current?.click()}
                className={`relative mb-7 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center transition-all duration-300 overflow-hidden select-none ${
                  isLoading
                    ? "border-pink-200 bg-pink-50/40 cursor-default pointer-events-none"
                    : isDragging
                    ? "border-pink-500 bg-pink-50 scale-[1.02] shadow-lg shadow-pink-200/40"
                    : selectedFile
                    ? "border-pink-300 bg-pink-50/60"
                    : "border-pink-200 bg-gray-50/50 hover:border-pink-400 hover:bg-pink-50/70"
                }`}
                role="button"
                aria-label="Upload Dokumen"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.odt,.odp"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isLoading}
                />

                {/* Loading state */}
                {isLoading ? (
                  <div className="w-full flex flex-col items-center gap-5">
                    {/* Circular progress */}
                    <div className="relative w-20 h-20">
                      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="#fce7f3" strokeWidth="6" />
                        <circle
                          cx="32" cy="32" r="28" fill="none"
                          stroke="#f43f5e" strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 28}`}
                          strokeDashoffset={`${2 * Math.PI * 28 * (1 - uploadProgress / 100)}`}
                          className="transition-all duration-500 ease-out"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-pink-600">
                        {Math.round(uploadProgress)}%
                      </span>
                    </div>

                    <div className="text-center">
                      <p className="font-black text-gray-700 text-base leading-snug">
                        {LOADING_STEPS[loadingStep]?.icon}{" "}
                        {LOADING_STEPS[loadingStep]?.text}
                      </p>
                      <p className="text-xs text-gray-400 mt-1.5 font-medium">
                        Proses ~30–60 detik, tunggu bentar ya...
                      </p>
                    </div>

                    {/* Step indicators */}
                    <div className="flex gap-1.5">
                      {LOADING_STEPS.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            i < loadingStep
                              ? "bg-pink-500 w-4"
                              : i === loadingStep
                              ? "bg-pink-400 w-6 animate-pulse"
                              : "bg-pink-100 w-3"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                ) : selectedFile ? (
                  /* File selected state */
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-pink-100 flex items-center justify-center text-3xl shadow-sm">
                      {getFileIcon(selectedFile.name)}
                    </div>
                    <div>
                      <p className="font-black text-gray-800 text-base truncate max-w-[220px]">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-gray-400 mt-0.5 text-center">
                        {formatBytes(selectedFile.size)} · Siap dianalisis
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="text-sm font-bold text-pink-500 hover:text-pink-700 underline underline-offset-4 transition-colors mt-1"
                    >
                      Ganti file
                    </button>
                  </div>
                ) : (
                  /* Empty state */
                  <>
                    <div
                      className={`w-16 h-16 mb-4 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                        isDragging
                          ? "bg-pink-500 scale-110 shadow-lg shadow-pink-400/30"
                          : "bg-white border border-pink-100 shadow-sm"
                      }`}
                    >
                      <svg
                        className={`w-8 h-8 ${isDragging ? "text-white" : "text-pink-400"}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <p className="font-black text-gray-800 text-lg">
                      {isDragging ? "Lepas untuk upload!" : "Seret dokumennya ke sini"}
                    </p>
                    <p className="text-sm font-medium text-gray-400 mt-2">
                      atau klik aja buat pilih file
                    </p>
                    {/* Format pills */}
                    <div className="flex gap-2 mt-4 flex-wrap justify-center">
                      {["PDF", "DOCX", "PPTX"].map((fmt) => (
                        <span
                          key={fmt}
                          className="text-[11px] font-black text-pink-500 bg-pink-50 border border-pink-100 px-2.5 py-1 rounded-full"
                        >
                          {fmt}
                        </span>
                      ))}
                      <span className="text-[11px] font-medium text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-full">
                        maks {MAX_FILE_SIZE_MB}MB
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={handleSubmit}
                disabled={!selectedFile || isLoading}
                className="group relative w-full flex items-center justify-center gap-2.5 py-5 px-6 rounded-2xl font-black text-white text-lg transition-all duration-300
                  bg-gradient-to-r from-pink-500 to-rose-500
                  hover:from-pink-600 hover:to-rose-600
                  hover:shadow-[0_8px_30px_rgba(244,63,94,0.4)]
                  hover:-translate-y-1
                  active:scale-[0.98] active:translate-y-0
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-5 h-5 text-white/80" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Lagi Nganalisis Bentar Yaa...
                  </>
                ) : (
                  <>
                    Lanjut Analisis
                    <span className="group-hover:translate-x-1 transition-transform text-xl">→</span>
                  </>
                )}
              </button>

              <p className="text-center text-xs font-bold text-gray-300 mt-5 uppercase tracking-widest">
              
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="flex items-center gap-3 bg-gray-900 text-white px-5 py-4 rounded-2xl shadow-2xl max-w-sm border border-gray-700">
            <span className="text-red-400 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </span>
            <p className="text-sm font-semibold flex-1 leading-snug">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-gray-500 hover:text-white ml-1 flex-shrink-0 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}