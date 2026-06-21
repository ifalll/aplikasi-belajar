export const maxDuration = 60; // Mengizinkan Vercel mengeksekusi hingga batas maksimal Hobby Plan

import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { parseOffice } from "officeparser";

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_RETRIES = 2;
const GEMINI_MODEL = "gemini-2.5-flash";

const FILE_TYPES: Record<string, { strategy: "native-pdf" | "office-text"; ext: string; label: string }> = {
  "application/pdf": { strategy: "native-pdf", ext: ".pdf", label: "PDF" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { strategy: "office-text", ext: ".pptx", label: "PPTX" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { strategy: "office-text", ext: ".docx", label: "DOCX" },
  "application/vnd.oasis.opendocument.presentation": { strategy: "office-text", ext: ".odp", label: "ODP" },
  "application/vnd.oasis.opendocument.text": { strategy: "office-text", ext: ".odt", label: "ODT" },
};

const ALLOWED_EXTS: Record<string, { strategy: "native-pdf" | "office-text"; label: string }> = {
  ".pdf":  { strategy: "native-pdf",  label: "PDF" },
  ".pptx": { strategy: "office-text", label: "PPTX" },
  ".docx": { strategy: "office-text", label: "DOCX" },
  ".odp":  { strategy: "office-text", label: "ODP" },
  ".odt":  { strategy: "office-text", label: "ODT" },
};

function getAiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set.");
  return new GoogleGenAI({ apiKey: key });
}

// ─── PROMPTS & SCHEMAS PER ACTION ──────────────────────────────────────────────

const PROMPTS = {
  summary: `Kamu adalah asisten belajar pribadi yang sangat teliti.
ATURAN WAJIB: Gunakan HANYA informasi dari materi. Tulis dengan gaya bahasa natural layaknya mahasiswa, formal namun humanis.
Hasilkan 2 komponen:
1. JUDUL (judul_materi): Judul singkat deskriptif (maks 10 kata).
2. RANGKUMAN (rangkuman): Rangkuman komprehensif mencakup SEMUA topik penting.`,
  
  quiz: `Kamu adalah asisten pembuat soal. Berdasarkan materi yang diberikan, buatlah PERSIS 35 soal pilihan ganda (4 pilihan jawaban).
Tingkat kesulitan: MENENGAH-SULIT. Uji pemahaman konsep. Sertakan jawaban benar dan penjelasan singkat (1-2 kalimat) mengapa jawaban itu benar.`,

  flashcard: `Kamu adalah asisten pembuat flashcard. Berdasarkan materi yang diberikan, buat minimal 20 flashcard untuk istilah dan definisi penting.
Depan: Istilah. Belakang: Penjelasan ringkas dan akurat.`
};

const SCHEMAS = {
  summary: {
    type: Type.OBJECT,
    properties: {
      judul_materi: { type: Type.STRING },
      rangkuman: { type: Type.STRING },
    },
    required: ["judul_materi", "rangkuman"],
  },
  quiz: {
    type: Type.OBJECT,
    properties: {
      kuis: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pertanyaan: { type: Type.STRING },
            pilihan: { type: Type.ARRAY, items: { type: Type.STRING } },
            jawaban_benar: { type: Type.STRING },
            penjelasan: { type: Type.STRING },
          },
          required: ["pertanyaan", "pilihan", "jawaban_benar", "penjelasan"],
        },
      },
    },
    required: ["kuis"],
  },
  flashcard: {
    type: Type.OBJECT,
    properties: {
      flashcards: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            depan: { type: Type.STRING },
            belakang: { type: Type.STRING },
          },
          required: ["depan", "belakang"],
        },
      },
    },
    required: ["flashcards"],
  }
};

function validateAndClean(data: any, action: string): { valid: boolean; reason?: string } {
  if (!data || typeof data !== "object") return { valid: false, reason: "Respons bukan objek." };
  
  if (action === "summary") {
    if (!data.judul_materi?.trim() || !data.rangkuman?.trim() || data.rangkuman.length < 50) 
      return { valid: false, reason: "Judul atau rangkuman kosong." };
  } else if (action === "quiz") {
    if (!Array.isArray(data.kuis) || data.kuis.length < 10) 
      return { valid: false, reason: "Jumlah soal tidak cukup." };
    for (let i = 0; i < data.kuis.length; i++) {
      const q = data.kuis[i];
      if (!q.pertanyaan?.trim() || !Array.isArray(q.pilihan) || !q.jawaban_benar?.trim()) {
        return { valid: false, reason: `Soal #${i + 1} tidak lengkap.` };
      }
    }
  } else if (action === "flashcard") {
    if (!Array.isArray(data.flashcards) || data.flashcards.length < 5) 
      return { valid: false, reason: "Flashcard tidak cukup." };
  }
  return { valid: true };
}

type GenerateInput = { mode: "pdf"; base64: string } | { mode: "text"; extractedText: string; sourceLabel: string };

async function generateWithRetry(input: GenerateInput, action: "summary" | "quiz" | "flashcard", attempt = 0): Promise<any> {
  const ai = getAiClient();
  const promptText = PROMPTS[action];
  
  const parts: any[] = input.mode === "pdf"
    ? [ { inlineData: { mimeType: "application/pdf", data: input.base64 } }, { text: promptText } ]
    : [ { text: `Berikut adalah isi materi (${input.sourceLabel}) yang perlu dianalisis:\n\n---\n${input.extractedText}\n---\n\n${promptText}` } ];

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: SCHEMAS[action] as any,
      temperature: attempt === 0 ? 0.7 : 0.9,
    },
  });

  const rawText = response.text ?? "";
  if (!rawText.trim()) throw new Error("AI mengembalikan respons kosong.");

  let parsed: any;
  try {
    parsed = JSON.parse(rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  } catch {
    throw new Error("Respons AI bukan JSON yang valid.");
  }

  const { valid, reason } = validateAndClean(parsed, action);
  if (!valid) {
    if (attempt < MAX_RETRIES) return generateWithRetry(input, action, attempt + 1);
    throw new Error(`Validasi gagal: ${reason}`);
  }

  return parsed;
}

function detectFileType(file: File) {
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  const byMime = FILE_TYPES[file.type];
  if (byMime) return byMime;
  const byExt = ALLOWED_EXTS[ext];
  if (byExt) return { strategy: byExt.strategy, ext, label: byExt.label };
  return null;
}

// ─── CORE ENDPOINT ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let action: "summary" | "quiz" | "flashcard" = "summary"; // Deklarasi di luar agar bisa diakses catch
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    action = (formData.get("action") as "summary" | "quiz" | "flashcard") || "summary";

    if (!file || !(file instanceof File)) return NextResponse.json({ error: "Tidak ada dokumen yang dikirim." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE_BYTES) return NextResponse.json({ error: "Ukuran dokumen melebihi batas." }, { status: 413 });

    const fileType = detectFileType(file);
    if (!fileType) return NextResponse.json({ error: "Format dokumen tidak didukung." }, { status: 415 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let generateInput: GenerateInput;

    if (fileType.strategy === "native-pdf") {
      generateInput = { mode: "pdf", base64: buffer.toString("base64") };
    } else {
      let extractedText: string;
      try {
        const extHint = fileType.ext.replace(".", ""); 
        // Menggunakan 'any' secara eksplisit di sini untuk menghindari strict type checking
        const ast: any = await parseOffice(buffer, { fileType: extHint as any });
        extractedText = typeof ast === "string" ? ast : (ast?.toText ? ast.toText() : JSON.stringify(ast));
        
        if (!extractedText || extractedText.length < 20) throw new Error("Teks kosong.");
      } catch (e: any) {
        return NextResponse.json({ error: "Gagal membaca isi dokumen." }, { status: 422 });
      }
      generateInput = { mode: "text", extractedText, sourceLabel: fileType.label };
    }

    const result = await generateWithRetry(generateInput, action);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error(`[Stuby] Error API pada action [${action}]:`, error);
    return NextResponse.json({ error: "Terjadi kesalahan server saat memproses AI." }, { status: 500 });
  }
}