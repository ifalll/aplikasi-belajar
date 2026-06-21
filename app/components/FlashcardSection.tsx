"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Flashcard } from "../page";

type ConfidenceLevel = 1 | 2 | 3; // 1=susah, 2=ragu, 3=hafal

interface CardStats {
  confidence: ConfidenceLevel;
  attempts: number;
}

export default function FlashcardSection({ cards }: { cards: Flashcard[] }) {
  const [queue, setQueue] = useState<number[]>([]);
  const [mastered, setMastered] = useState<number[]>([]);
  const [unsure, setUnsure] = useState<number[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | "up" | null>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [sessionStreak, setSessionStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [cardStats, setCardStats] = useState<Record<number, CardStats>>({});
  const [showStats, setShowStats] = useState(false);
  const [sessionActions, setSessionActions] = useState<Array<{ card: number; action: ConfidenceLevel }>>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQueue(cards.map((_, i) => i));
    setMastered([]);
    setUnsure([]);
    setSessionStreak(0);
    setMaxStreak(0);
    setCardStats({});
    setSessionActions([]);
  }, [cards]);

  const shuffleQueue = () => {
    setIsFlipped(false);
    setDragOffset({ x: 0, y: 0 });
    setQueue((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  const handleAction = useCallback(
    (confidence: ConfidenceLevel, dir: "left" | "right" | "up") => {
      setSwipeDir(dir);
      setIsFlipped(false);
      setDragOffset({ x: 0, y: 0 });

      setTimeout(() => {
        setSwipeDir(null);
        setQueue((prev) => {
          const next = [...prev];
          const current = next.shift();
          if (current === undefined) return next;

          // Update stats
          setCardStats((s) => ({
            ...s,
            [current]: {
              confidence,
              attempts: (s[current]?.attempts ?? 0) + 1,
            },
          }));

          setSessionActions((a) => [...a, { card: current, action: confidence }]);

          if (confidence === 3) {
            // Hafal — mastered
            setMastered((m) => [...m, current]);
            setSessionStreak((s) => {
              const ns = s + 1;
              setMaxStreak((m) => Math.max(m, ns));
              return ns;
            });
          } else if (confidence === 2) {
            // Ragu — put back further (position 3–5)
            const insertAt = Math.min(3, next.length);
            next.splice(insertAt, 0, current);
            setUnsure((u) => [...u, current]);
            setSessionStreak(0);
          } else {
            // Susah — go back to end
            next.push(current);
            setSessionStreak(0);
          }

          return next;
        });
      }, 360);
    },
    []
  );

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    setDragOffset({
      x: e.targetTouches[0].clientX - touchStart.x,
      y: e.targetTouches[0].clientY - touchStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const { x, y } = dragOffset;

    if (!isFlipped) {
      // First flip on any swipe
      if (Math.abs(x) > 30 || Math.abs(y) > 30) setIsFlipped(true);
    } else {
      if (Math.abs(x) > 80) {
        handleAction(x > 0 ? 3 : 1, x > 0 ? "right" : "left");
      } else if (y < -80) {
        handleAction(2, "up");
      } else {
        setDragOffset({ x: 0, y: 0 });
      }
    }
    setTouchStart(null);
  };

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!queue.length) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      }
      if (!isFlipped) return;
      if (e.key === "ArrowRight") handleAction(3, "right");
      if (e.key === "ArrowLeft") handleAction(1, "left");
      if (e.key === "ArrowUp") handleAction(2, "up");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFlipped, queue.length, handleAction]);

  // ─── STATS ────────────────────────────────────────────────
  if (showStats) {
    const totalAttempts = sessionActions.length;
    const masteredNow = mastered.length;
    const stillLearning = queue.length;
    const hardCards = Object.entries(cardStats)
      .filter(([, s]) => s.confidence === 1 && s.attempts >= 2)
      .slice(0, 5);

    return (
      <div className="flex flex-col p-8 sm:p-12 min-h-[400px]">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black text-gray-800">Statistik Sesi</h2>
          <button
            onClick={() => setShowStats(false)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl hover:border-pink-200 hover:text-pink-600 transition-all"
          >
            ← Kembali
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Total Kartu", value: cards.length, icon: "🃏", color: "from-pink-50 to-rose-50 border-pink-100 text-pink-600" },
            { label: "Sudah Hafal", value: masteredNow, icon: "✅", color: "from-green-50 to-emerald-50 border-green-100 text-green-600" },
            { label: "Sisa Belajar", value: stillLearning, icon: "📚", color: "from-amber-50 to-yellow-50 border-amber-100 text-amber-600" },
            { label: "Streak Terbaik", value: maxStreak, icon: "🔥", color: "from-orange-50 to-red-50 border-orange-100 text-orange-600" },
          ].map((s) => (
            <div key={s.label} className={`flex flex-col items-center py-5 px-3 rounded-2xl bg-gradient-to-br border ${s.color}`}>
              <span className="text-2xl mb-2">{s.icon}</span>
              <span className="font-black text-2xl">{s.value}</span>
              <span className="text-[11px] font-semibold opacity-70 mt-1 text-center">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 mb-6">
          <div className="flex justify-between text-sm font-bold text-gray-600 mb-3">
            <span>Progress Hafalan</span>
            <span>{cards.length > 0 ? Math.round((masteredNow / cards.length) * 100) : 0}%</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-rose-500 rounded-full transition-all duration-700"
              style={{ width: `${cards.length > 0 ? (masteredNow / cards.length) * 100 : 0}%` }}
            />
          </div>
          <div className="flex gap-4 mt-3 text-xs text-gray-400 font-medium">
            <span>🟢 Hafal: {masteredNow}</span>
            <span>🟡 Ragu: {unsure.filter(i => queue.includes(i)).length}</span>
            <span>🔴 Susah: {stillLearning - unsure.filter(i => queue.includes(i)).length}</span>
          </div>
        </div>

        {/* Hard cards */}
        {hardCards.length > 0 && (
          <div>
            <h3 className="font-black text-gray-700 text-sm mb-3 flex items-center gap-2">
              <span>🎯</span> Kartu yang perlu diulang
            </h3>
            <div className="space-y-2">
              {hardCards.map(([idx]) => {
                const card = cards[Number(idx)];
                return (
                  <div key={idx} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm">
                    <span className="text-red-400 flex-shrink-0">⚡</span>
                    <span className="font-semibold text-red-800 truncate">{card?.depan}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-auto pt-6 flex gap-3">
          <button
            onClick={() => {
              setQueue(cards.map((_, i) => i));
              setMastered([]);
              setUnsure([]);
              setSessionStreak(0);
              setCardStats({});
              setSessionActions([]);
              setShowStats(false);
            }}
            className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black py-3.5 px-6 rounded-2xl hover:shadow-[0_8px_24px_rgba(244,63,94,0.35)] hover:-translate-y-0.5 transition-all"
          >
            Mulai Ulang 🔄
          </button>
          <button
            onClick={() => setShowStats(false)}
            className="flex-1 bg-white border-2 border-gray-100 text-gray-700 font-semibold py-3.5 px-6 rounded-2xl hover:border-pink-200 hover:text-pink-600 transition-all"
          >
            Lanjut Belajar
          </button>
        </div>
      </div>
    );
  }

  // ─── COMPLETED SCREEN ─────────────────────────────────────
  if (queue.length === 0 && cards.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 sm:p-16 text-center min-h-[400px]">
        <div className="text-7xl mb-5 confetti-pop inline-block">🎉</div>
        <h2 className="text-3xl font-black text-gray-900 mb-2">Semua Kartu Dikuasai!</h2>
        <p className="text-gray-400 mb-2 max-w-xs leading-relaxed">
          Kamu berhasil menghafal semua <strong className="text-pink-600">{mastered.length} kartu</strong> dalam sesi ini.
        </p>
        {maxStreak > 2 && (
          <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-600 border border-orange-100 px-4 py-2 rounded-xl mb-6 font-semibold text-sm">
            🔥 Streak terpanjang: {maxStreak} kartu berturut-turut!
          </div>
        )}
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={() => {
              setQueue(cards.map((_, i) => i));
              setMastered([]);
              setUnsure([]);
              setSessionStreak(0);
            }}
            className="bg-gradient-to-r from-pink-500 to-rose-500 text-white font-black py-3 px-6 rounded-2xl hover:shadow-[0_8px_24px_rgba(244,63,94,0.35)] hover:-translate-y-0.5 transition-all"
          >
            Ulangi Semua 🔄
          </button>
          <button
            onClick={() => {
              setQueue([...mastered].sort(() => Math.random() - 0.5));
              setMastered([]);
              setUnsure([]);
              setSessionStreak(0);
            }}
            className="bg-white border-2 border-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-2xl hover:border-pink-200 hover:text-pink-600 transition-all"
          >
            Acak Ulang 🔀
          </button>
          <button
            onClick={() => setShowStats(true)}
            className="bg-pink-50 border-2 border-pink-100 text-pink-600 font-semibold py-3 px-6 rounded-2xl hover:bg-pink-100 transition-all"
          >
            Lihat Statistik 📊
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN CARD SCREEN ─────────────────────────────────────
  const currentCard = cards[queue[0]];
  const totalCards = cards.length;
  const masteredCount = mastered.length;
  const progressPct = (masteredCount / totalCards) * 100;
  const currentStats = cardStats[queue[0]];

  const swipeStyle: React.CSSProperties = swipeDir
    ? {
        transform: `translateX(${swipeDir === "right" ? "110%" : swipeDir === "left" ? "-110%" : "0"}) translateY(${swipeDir === "up" ? "-110%" : "0"}) rotate(${swipeDir === "right" ? 10 : swipeDir === "left" ? -10 : 0}deg)`,
        opacity: 0,
        transition: "transform 0.36s cubic-bezier(0.23,1,0.32,1), opacity 0.3s ease",
      }
    : isDragging && (Math.abs(dragOffset.x) > 5 || Math.abs(dragOffset.y) > 5)
    ? {
        transform: `translateX(${dragOffset.x}px) translateY(${dragOffset.y}px) rotate(${dragOffset.x * 0.045}deg)`,
        transition: "none",
      }
    : {
        transform: "translateX(0) translateY(0) rotate(0deg)",
        transition: "transform 0.3s cubic-bezier(0.23,1,0.32,1)",
      };

  const dragHint =
    dragOffset.x > 50 ? "right" : dragOffset.x < -50 ? "left" : dragOffset.y < -50 ? "up" : null;

  return (
    <div className="flex flex-col items-center px-6 py-10 sm:px-12 sm:py-12 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-pink-100 rounded-full blur-[60px] opacity-60 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-rose-100 rounded-full blur-[60px] opacity-40 pointer-events-none" />

      {/* ── Stats bar ──────────────────────────────────────── */}
      <div className="w-full max-w-md flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#fce7f3" strokeWidth="4" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke="#f43f5e" strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - progressPct / 100)}`}
                className="progress-bar"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-pink-600">
              {masteredCount}/{totalCards}
            </span>
          </div>
          <div>
            <p className="text-xs font-black text-gray-700">{queue.length} kartu tersisa</p>
            {sessionStreak >= 2 && (
              <p className="text-[10px] text-orange-500 font-bold mt-0.5">🔥 Streak {sessionStreak}!</p>
            )}
            {currentStats && currentStats.attempts >= 2 && (
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                Percobaan ke-{currentStats.attempts}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(true)}
            title="Lihat statistik"
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm hover:border-pink-200 hover:text-pink-600 transition-all"
          >
            📊
          </button>
          <button
            onClick={shuffleQueue}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm hover:border-pink-200 hover:text-pink-600 transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
            </svg>
            Acak
          </button>
        </div>
      </div>

      {/* ── Card stack ────────────────────────────────────── */}
      <div className="relative w-full max-w-md mb-6 z-10" style={{ height: "22rem" }}>
        {/* Shadow cards */}
        {queue.slice(1, 3).map((_, stackIdx) => (
          <div
            key={stackIdx}
            className="absolute inset-0 rounded-[2rem] bg-white border border-pink-100"
            style={{
              transform: `scale(${0.97 - stackIdx * 0.03}) translateY(${(stackIdx + 1) * 10}px)`,
              zIndex: -stackIdx - 1,
              opacity: 0.65 - stackIdx * 0.2,
            }}
          />
        ))}

        {/* Main card */}
        <div
          ref={cardRef}
          onClick={() => !isDragging && setIsFlipped((f) => !f)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="absolute inset-0 cursor-pointer select-none"
          style={{ perspective: "1500px", ...swipeStyle }}
        >
          <div className={`flip-card-inner relative w-full h-full ${isFlipped ? "flipped" : ""}`}>
            {/* Front */}
            <div className="flip-card-face absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-white border-2 border-pink-100/80 p-8 sm:p-10 shadow-[0_12px_40px_rgba(244,63,94,0.10)]">
              {/* Swipe hints */}
              {dragHint === "right" && (
                <div className="absolute top-5 right-5 bg-green-100 text-green-700 text-xs font-black px-3 py-1.5 rounded-xl border border-green-200 animate-in fade-in duration-100">
                  😎 Hafal!
                </div>
              )}
              {dragHint === "left" && (
                <div className="absolute top-5 left-5 bg-red-100 text-red-700 text-xs font-black px-3 py-1.5 rounded-xl border border-red-200 animate-in fade-in duration-100">
                  🤯 Susah
                </div>
              )}
              {dragHint === "up" && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-amber-100 text-amber-700 text-xs font-black px-3 py-1.5 rounded-xl border border-amber-200 animate-in fade-in duration-100">
                  🤔 Ragu
                </div>
              )}

              <div className="w-10 h-1 bg-pink-100 rounded-full mb-auto mt-2" />
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] mb-3">Istilah</p>
              <p className="text-2xl sm:text-3xl font-black text-gray-900 text-center leading-tight mb-auto">
                {currentCard?.depan}
              </p>
              <p className="text-[11px] text-pink-400 font-semibold mt-auto flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                </svg>
                Tap untuk lihat jawaban
              </p>
            </div>

            {/* Back */}
            <div className="flip-card-face flip-card-back absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-gradient-to-br from-pink-50 via-white to-rose-50 border-2 border-pink-200 p-8 sm:p-10 shadow-[0_12px_40px_rgba(244,63,94,0.15)]">
              <p className="text-[10px] font-black text-pink-400 uppercase tracking-[0.2em] mb-4">Definisi</p>
              <p className="text-gray-700 font-medium text-[16px] leading-relaxed text-center overflow-y-auto max-h-[13rem]">
                {currentCard?.belakang}
              </p>
              <p className="mt-auto pt-4 text-[10px] text-pink-300 font-semibold text-center">
                → Hafal · ↑ Ragu · ← Susah
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action buttons ────────────────────────────────── */}
      <div
        className={`flex gap-3 w-full max-w-md z-10 transition-all duration-300 ${
          isFlipped ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <button
          onClick={() => handleAction(1, "left")}
          className="group flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-300 active:scale-[0.96] transition-all shadow-sm"
        >
          <span className="text-xl group-hover:scale-110 transition-transform">🤯</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Susah</span>
        </button>
        <button
          onClick={() => handleAction(2, "up")}
          className="group flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white border-2 border-amber-100 text-amber-600 hover:bg-amber-50 hover:border-amber-300 active:scale-[0.96] transition-all shadow-sm"
        >
          <span className="text-xl group-hover:scale-110 transition-transform">🤔</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Ragu</span>
        </button>
        <button
          onClick={() => handleAction(3, "right")}
          className="group flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 text-white hover:from-pink-600 hover:to-rose-600 active:scale-[0.96] transition-all shadow-lg shadow-pink-500/25"
        >
          <span className="text-xl group-hover:scale-110 transition-transform">😎</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Hafal!</span>
        </button>
      </div>

      {/* ── Keyboard hints ────────────────────────────────── */}
      <div className="mt-6 flex items-center gap-5 z-10 opacity-40">
        {[
          { key: "Space", action: "balik" },
          { key: "←", action: "susah" },
          { key: "↑", action: "ragu" },
          { key: "→", action: "hafal" },
        ].map((k) => (
          <div key={k.key} className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <kbd className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono text-[9px] border border-gray-200">
              {k.key}
            </kbd>
            <span>{k.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}