"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QuizItem } from "../page";

type Mode = "playing" | "finished";
type AnswerState = { selected: string; revealed: boolean };

const QUESTIONS_PER_PAGE = 5;

export default function QuizSection({ questions }: { questions: QuizItem[] }) {
  const [mode, setMode] = useState<Mode>("playing");
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  
  const duration = questions.length * 60; // 60 detik per soal
  const [timeLeft, setTimeLeft] = useState(duration);
  const [endTime, setEndTime] = useState<number | null>(null);
  
  const [currentPage, setCurrentPage] = useState(0);
  const [showMinimap, setShowMinimap] = useState(false);
  const minimapRef = useRef<HTMLDivElement>(null);

  // ─── Timer Berbasis Waktu Absolut (Akurat) ─────────────────
  
  // 1. Tetapkan waktu target saat kuis dimulai atau di-reset
  useEffect(() => {
    if (mode === "playing") {
      setEndTime(Date.now() + duration * 1000);
      setTimeLeft(duration);
    }
  }, [mode, duration]);

  // 2. Hitung selisih waktu secara presisi
  useEffect(() => {
    if (mode !== "playing" || !endTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        setMode("finished");
      }
    }, 500); // Dijalankan tiap 500ms agar UI tidak patah-patah

    return () => clearInterval(interval);
  }, [mode, endTime]);

  // Close minimap on outside click
  useEffect(() => {
    if (!showMinimap) return;
    const handler = (e: MouseEvent) => {
      if (minimapRef.current && !minimapRef.current.contains(e.target as Node)) {
        setShowMinimap(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMinimap]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const selectAnswer = useCallback(
    (qi: number, option: string) => {
      if (mode === "finished" || answers[qi]?.revealed) return;
      setAnswers((prev) => ({ ...prev, [qi]: { selected: option, revealed: false } }));
    },
    [mode, answers]
  );

  const revealAnswer = useCallback(
    (qi: number) => {
      if (!answers[qi] || answers[qi].revealed) return;
      setAnswers((prev) => ({ ...prev, [qi]: { ...prev[qi], revealed: true } }));
    },
    [answers]
  );

  const goToQuestion = (qi: number) => {
    const page = Math.floor(qi / QUESTIONS_PER_PAGE);
    setCurrentPage(page);
    setShowMinimap(false);
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const answeredCount = Object.keys(answers).length;
  const revealedCount = Object.values(answers).filter((a) => a.revealed).length;
  const correctCount = questions.filter((q, i) => answers[i]?.revealed && answers[i]?.selected === q.jawaban_benar).length;
  const liveScore = correctCount * 10;

  const pageStart = currentPage * QUESTIONS_PER_PAGE;
  const pageEnd = Math.min(pageStart + QUESTIONS_PER_PAGE, questions.length);
  const currentQuestions = questions.slice(pageStart, pageEnd);
  const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);

  const totalCorrect = questions.filter((q, i) => answers[i]?.selected === q.jawaban_benar).length;
  const pct = Math.round((totalCorrect / questions.length) * 100);
  const maxScore = questions.length * 10;
  const finalScore = totalCorrect * 10;

  const timeWarning = timeLeft < 120;
  const timeCritical = timeLeft < 30;

  const resetQuiz = () => {
    setAnswers({});
    setMode("playing");
    setCurrentPage(0);
    // timeLeft & endTime otomatis di-reset oleh useEffect di atas
  };

  // ─── RESULTS SCREEN ───────────────────────────────────────
  if (mode === "finished") {
    const medal = pct >= 90 ? "🏆" : pct >= 70 ? "🥈" : pct >= 50 ? "👍" : "💪";
    const gradeLabel = pct >= 90 ? "Luar Biasa!" : pct >= 70 ? "Bagus Banget!" : pct >= 50 ? "Cukup Baik" : "Ayo Semangat!";
    const gradeColor = pct >= 90 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : pct >= 50 ? "text-amber-600" : "text-rose-600";
    const gradeBg = pct >= 90 ? "from-emerald-50 to-teal-50 border-emerald-100" : pct >= 70 ? "from-blue-50 to-indigo-50 border-blue-100" : pct >= 50 ? "from-amber-50 to-yellow-50 border-amber-100" : "from-rose-50 to-pink-50 border-rose-100";
    const wrongAnswers = questions.filter((_, i) => answers[i]?.selected !== _.jawaban_benar);

    return (
      <div className="p-6 sm:p-12 space-y-8">
        <div className={`text-center py-8 px-6 rounded-3xl bg-gradient-to-br border ${gradeBg}`}>
          <div className="text-7xl mb-4 inline-block confetti-pop">{medal}</div>
          <h2 className="text-3xl font-black text-gray-900 mb-1">{gradeLabel}</h2>
          <p className="text-gray-400 text-sm mb-4">Hasil akhir kamu</p>
          <div className="inline-flex items-baseline gap-1">
            <span className={`text-6xl font-black ${gradeColor}`}>{finalScore}</span>
            <span className="text-gray-300 text-2xl font-bold">/ {maxScore}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Benar", value: totalCorrect, color: "from-emerald-50 to-green-50 border-green-100 text-green-700" },
            { label: "Salah", value: wrongAnswers.length, color: "from-red-50 to-rose-50 border-red-100 text-red-600" },
            { label: "Akurasi", value: `${pct}%`, color: "from-pink-50 to-rose-50 border-pink-100 text-pink-600" },
          ].map((s) => (
            <div key={s.label} className={`flex flex-col items-center py-5 rounded-2xl bg-gradient-to-br border ${s.color}`}>
              <span className="font-black text-2xl sm:text-3xl">{s.value}</span>
              <span className="text-xs font-semibold opacity-70 mt-1">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#fce7f3" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke={pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e"}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42}`}
                strokeDashoffset={`${2 * Math.PI * 42 * (1 - pct / 100)}`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-black text-2xl text-gray-800">{pct}%</span>
              <span className="text-[9px] text-gray-400 uppercase tracking-wider font-bold">Akurasi</span>
            </div>
          </div>
        </div>

        {wrongAnswers.length > 0 && (
          <div className="rounded-3xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 bg-gray-50 border-b border-gray-100">
              <span className="text-xl">🧐</span>
              <div>
                <h3 className="font-black text-gray-800 text-base">Evaluasi Jawaban Salah</h3>
                <p className="text-xs text-gray-400 font-medium mt-0.5">
                  {wrongAnswers.length} soal perlu dipelajari ulang
                </p>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {questions.map((q, i) => {
                const ans = answers[i];
                if (ans?.selected === q.jawaban_benar) return null;
                return (
                  <div key={i} className="px-6 py-5 text-sm">
                    <p className="font-semibold text-gray-800 mb-3 leading-relaxed">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-pink-100 text-pink-600 text-xs font-black mr-2">
                        {i + 1}
                      </span>
                      {q.pertanyaan}
                    </p>
                    <div className="space-y-2 mb-3 ml-8">
                      <div className="flex items-center gap-2 text-red-500 bg-red-50 px-3 py-2 rounded-xl border border-red-100">
                        <span>❌</span>
                        <span className="line-through opacity-80">{ans?.selected || "Tidak dijawab"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-100 px-3 py-2 rounded-xl font-semibold">
                        <span>✅</span>
                        {q.jawaban_benar}
                      </div>
                    </div>
                    {q.penjelasan && (
                      <p className="ml-8 text-gray-500 text-xs bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl leading-relaxed">
                        💡 {q.penjelasan}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-3">
          <button
            onClick={resetQuiz}
            className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black py-3.5 px-8 rounded-2xl hover:shadow-[0_8px_24px_rgba(244,63,94,0.35)] hover:-translate-y-0.5 active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  // ─── PLAYING SCREEN ───────────────────────────────────────
  const progressPct = (answeredCount / questions.length) * 100;

  return (
    <div className="p-6 sm:p-10">
      <div className="sticky top-4 z-30 mb-8 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-xl px-4 sm:px-5 py-3.5 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.07)] border border-pink-50">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center text-lg">🏆</div>
          <div>
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.18em]">Skor</p>
            <p className="font-black text-lg text-pink-600 leading-none">{liveScore}</p>
          </div>
        </div>

        <div className="flex-1 max-w-xs hidden sm:block relative" ref={minimapRef}>
          <button onClick={() => setShowMinimap((v) => !v)} className="w-full text-left group">
            <div className="flex justify-between text-[9px] text-gray-300 font-bold mb-1.5">
              <span>{answeredCount}/{questions.length} dijawab</span>
              <span className="text-pink-400 group-hover:text-pink-600 transition-colors">
                {showMinimap ? "▲ Tutup" : "▼ Navigasi"}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-pink-400 to-rose-500 progress-bar rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
          </button>

          {showMinimap && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-pink-100 shadow-2xl p-4 z-40 animate-in slide-in-from-top-2 fade-in duration-200">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Navigasi Soal</p>
              <div className="grid grid-cols-10 gap-1.5">
                {questions.map((q, i) => {
                  const ans = answers[i];
                  const isAnswered = !!ans;
                  const isRevealed = ans?.revealed;
                  const isCorrect = ans?.selected === q.jawaban_benar;
                  const isCurrentPage = Math.floor(i / QUESTIONS_PER_PAGE) === currentPage;

                  let cls = "w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center cursor-pointer transition-all hover:scale-110 ";
                  if (isRevealed) cls += isCorrect ? "bg-green-100 text-green-700 border border-green-200" : "bg-red-100 text-red-500 border border-red-200";
                  else if (isAnswered) cls += "bg-pink-100 text-pink-600 border border-pink-200";
                  else if (isCurrentPage) cls += "bg-gray-100 text-gray-600 border border-gray-200 ring-2 ring-pink-300";
                  else cls += "bg-gray-50 text-gray-400 border border-gray-100 hover:border-pink-200";

                  return (
                    <button key={i} onClick={() => goToQuestion(i)} className={cls}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50">
                {[
                  { cls: "bg-green-100 border-green-200", label: "Benar" },
                  { cls: "bg-red-100 border-red-200", label: "Salah" },
                  { cls: "bg-pink-100 border-pink-200", label: "Dipilih" },
                  { cls: "bg-gray-50 border-gray-100", label: "Belum" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded border ${l.cls}`} />
                    <span className="text-[10px] text-gray-400 font-medium">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-colors ${timeCritical ? "bg-red-100 animate-pulse" : timeWarning ? "bg-amber-50" : "bg-gray-50"}`}>
            {timeCritical ? "🚨" : timeWarning ? "⚠️" : "⏱️"}
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.18em]">Waktu</p>
            <p className={`font-black text-lg leading-none tabular-nums transition-colors ${timeCritical ? "text-red-500 animate-pulse" : timeWarning ? "text-amber-500" : "text-gray-700"}`}>
              {formatTime(timeLeft)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
            Halaman {currentPage + 1} / {totalPages}
          </p>
          <p className="text-sm text-gray-500 font-medium mt-0.5">
            Soal {pageStart + 1}–{pageEnd} dari {questions.length}
          </p>
        </div>
        <button onClick={() => setShowMinimap((v) => !v)} className="sm:hidden flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl hover:border-pink-200 hover:text-pink-600 transition-all">
          🗺 Navigasi
        </button>
      </div>

      <div className="space-y-6">
        {currentQuestions.map((q, pageIdx) => {
          const qi = pageStart + pageIdx;
          const ans = answers[qi];
          const isRevealed = ans?.revealed ?? false;
          const isCorrect = ans?.selected === q.jawaban_benar;

          return (
            <div key={qi} className={`rounded-2xl border transition-all duration-300 overflow-hidden shadow-sm ${isRevealed ? isCorrect ? "border-green-200 bg-green-50/20" : "border-red-200 bg-red-50/10" : "border-gray-100 bg-white hover:border-pink-100"}`}>
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-3 mb-5">
                  <span className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-xs font-black ${isRevealed ? isCorrect ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600" : "bg-pink-50 text-pink-600 border border-pink-100"}`}>
                    {qi + 1}
                  </span>
                  <p className="text-gray-800 font-semibold leading-relaxed text-[15px]">{q.pertanyaan}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-2.5">
                  {q.pilihan.map((option) => {
                    const isSelected = ans?.selected === option;
                    const isCorrectOption = option === q.jawaban_benar;
                    let cls = "w-full text-left px-4 py-3.5 rounded-xl text-[13.5px] font-medium border-2 transition-all duration-200 text-start ";
                    
                    if (isRevealed) {
                      if (isCorrectOption) cls += "border-green-400 bg-green-50 text-green-800 font-bold";
                      else if (isSelected && !isCorrectOption) cls += "border-red-300 bg-red-50 text-red-700 line-through opacity-60";
                      else cls += "border-gray-100 bg-gray-50 text-gray-400 opacity-50";
                    } else if (isSelected) {
                      cls += "border-pink-500 bg-pink-50 text-pink-700 shadow-sm scale-[1.01] answer-pulse";
                    } else {
                      cls += "border-gray-100 bg-gray-50/60 text-gray-600 hover:border-pink-200 hover:bg-pink-50/40 active:scale-[0.98]";
                    }

                    return (
                      <button key={option} onClick={() => selectAnswer(qi, option)} disabled={isRevealed} className={cls}>
                        <span className="flex items-center gap-2">
                          {isRevealed && isCorrectOption && <span className="text-green-500 flex-shrink-0">✓</span>}
                          {isRevealed && isSelected && !isCorrectOption && <span className="text-red-400 flex-shrink-0">✗</span>}
                          {option}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {!isRevealed && ans?.selected && (
                  <button onClick={() => revealAnswer(qi)} className="mt-4 w-full py-3 rounded-xl text-sm font-bold text-pink-600 bg-pink-50 border border-pink-100 hover:bg-pink-100 active:scale-[0.98] transition-all">
                    Cek Jawaban ✨
                  </button>
                )}

                {isRevealed && q.penjelasan && (
                  <div className={`mt-4 flex gap-2.5 p-4 rounded-xl text-sm leading-relaxed ${isCorrect ? "bg-green-50 border border-green-100 text-green-800" : "bg-amber-50 border border-amber-100 text-amber-800"}`}>
                    <span className="flex-shrink-0 text-base">💡</span>
                    <p>{q.penjelasan}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex items-center justify-between gap-3">
        <button onClick={() => { setCurrentPage((p) => Math.max(0, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} disabled={currentPage === 0} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:border-pink-200 hover:text-pink-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          ← Sebelumnya
        </button>

        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i} onClick={() => { setCurrentPage(i); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${i === currentPage ? "bg-pink-500 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-pink-50 hover:text-pink-600"}`}>
              {i + 1}
            </button>
          ))}
        </div>

        {currentPage < totalPages - 1 ? (
          <button onClick={() => { setCurrentPage((p) => Math.min(totalPages - 1, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-pink-200 text-pink-600 bg-pink-50 hover:bg-pink-100 transition-all">
            Lanjut →
          </button>
        ) : (
          <button onClick={() => setMode("finished")} disabled={answeredCount === 0} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black bg-gradient-to-r from-pink-500 to-rose-500 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_4px_16px_rgba(244,63,94,0.35)] hover:-translate-y-0.5 active:scale-[0.98] transition-all">
            Kumpulkan ({answeredCount}/{questions.length}) →
          </button>
        )}
      </div>
    </div>
  );
}