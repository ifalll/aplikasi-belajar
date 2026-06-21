export const maxDuration = 60;

import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

type HistoryMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    // Parse request body
    let body: { context?: string; message?: string; history?: HistoryMessage[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Format request tidak valid." },
        { status: 400 }
      );
    }

    const { context, message, history = [] } = body;

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Pesan tidak boleh kosong." },
        { status: 400 }
      );
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.error("[Stuby Chat] GEMINI_API_KEY tidak dikonfigurasi");
      return NextResponse.json(
        { error: "Konfigurasi server bermasalah. Hubungi admin." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: key });

    // Build system instruction
    const systemInstruction = context?.trim()
      ? `Kamu adalah Stuby, asisten belajar pribadi yang cerdas, ramah, dan suportif. Nama kamu Stuby.

Konteks materi yang sedang dipelajari mahasiswa:
"""
${context.substring(0, 4000)}
"""

Aturan menjawab:
1. Jawab dengan bahasa Indonesia yang natural, mengalir, dan mudah dipahami — seperti teman belajar yang pintar, bukan seperti robot atau buku teks.
2. Fokus menjawab berdasarkan konteks materi di atas. Kalau pertanyaan ada di luar konteks, tetap bantu tapi ingatkan untuk kembali ke materi.
3. Gunakan analogi atau contoh sehari-hari kalau diminta atau kalau itu bisa memperjelas.
4. Jawab ringkas dan padat kecuali diminta penjelasan panjang.
5. Kalau mahasiswa tampak bingung, tawarkan untuk menjelaskan ulang dengan cara berbeda.
6. Hindari kata-kata seperti "Tentu!", "Baik!", "Tentunya!" di awal kalimat — langsung ke poin.`
      : `Kamu adalah Stuby, asisten belajar pribadi yang cerdas dan ramah.

Jawab pertanyaan mahasiswa dalam bahasa Indonesia yang natural dan mudah dipahami. Jadilah seperti teman belajar yang suportif — tidak kaku, tidak robotik. Langsung ke poin tanpa basa-basi berlebihan.`;

    // Build conversation history for Gemini
    // Gemini uses "user" and "model" roles (not "assistant")
    const conversationContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Add history (convert "assistant" → "model")
    for (const msg of history) {
      if (!msg.content?.trim()) continue;
      conversationContents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    // Add current message
    conversationContents.push({
      role: "user",
      parts: [{ text: message.trim() }],
    });

    // Call Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: conversationContents,
      config: {
        systemInstruction,
        temperature: 0.8,
        maxOutputTokens: 1200,
        topP: 0.9,
      },
    });

    const reply = response.text?.trim();
    if (!reply) {
      throw new Error("AI mengembalikan balasan kosong.");
    }

    return NextResponse.json(
      { reply },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("[Stuby Chat] Error:", error);
    const msg: string = error?.message ?? "";

    // Rate limit
    if (
      msg.includes("quota") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("429")
    ) {
      return NextResponse.json(
        {
          error:
            "Otak Stuby lagi kepanasan nih 🥵 Tunggu 1–2 menit terus coba lagi ya!",
        },
        { status: 429 }
      );
    }

    // API key issues
    if (msg.includes("API_KEY") || msg.includes("API key")) {
      return NextResponse.json(
        { error: "Konfigurasi server bermasalah. Hubungi admin." },
        { status: 500 }
      );
    }

    // Timeout
    if (msg.includes("DEADLINE_EXCEEDED") || msg.includes("timeout")) {
      return NextResponse.json(
        { error: "Stuby kelamaan mikir 😅 Coba tanya lagi ya." },
        { status: 504 }
      );
    }

    // Safety filter
    if (msg.includes("SAFETY")) {
      return NextResponse.json(
        { error: "Pertanyaan ini tidak bisa dijawab Stuby. Coba tanya hal lain." },
        { status: 422 }
      );
    }

    return NextResponse.json(
      { error: "Server Stuby lagi rewel 🙏 Coba lagi sebentar ya." },
      { status: 500 }
    );
  }
}