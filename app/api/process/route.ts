export const maxDuration = 60;

import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";
import { parseOffice } from "officeparser";

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_RETRIES = 1;

// gemini-2.5-flash: quota free tier lebih longgar dari 2.0-flash
// thinkingBudget: 0 di bawah akan matikan thinking mode → tetap cepat
const GEMINI_MODEL = "gemini-2.5-flash";

const FILE_TYPES: Record<
  string,
  { strategy: "native-pdf" | "office-text"; ext: string; label: string }
> = {
  "application/pdf": { strategy: "native-pdf", ext: ".pdf", label: "PDF" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    strategy: "office-text",
    ext: ".pptx",
    label: "PPTX",
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    strategy: "office-text",
    ext: ".docx",
    label: "DOCX",
  },
  "application/vnd.oasis.opendocument.presentation": {
    strategy: "office-text",
    ext: ".odp",
    label: "ODP",
  },
  "application/vnd.oasis.opendocument.text": {
    strategy: "office-text",
    ext: ".odt",
    label: "ODT",
  },
};

const ALLOWED_EXTS: Record<
  string,
  { strategy: "native-pdf" | "office-text"; label: string }
> = {
  ".pdf":  { strategy: "native-pdf",  label: "PDF"  },
  ".pptx": { strategy: "office-text", label: "PPTX" },
  ".docx": { strategy: "office-text", label: "DOCX" },
  ".odp":  { strategy: "office-text", label: "ODP"  },
  ".odt":  { strategy: "office-text", label: "ODT"  },
};

function getAiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set.");
  return new GoogleGenAI({ apiKey: key });
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const PROMPTS = {
  summary: `Kamu adalah asisten belajar pribadi yang sangat teliti.
ATURAN WAJIB: Gunakan HANYA informasi dari materi. Tulis dengan gaya bahasa natural layaknya mahasiswa, formal namun humanis.
Hasilkan 2 komponen:
1. JUDUL (judul_materi): Judul singkat deskriptif (maks 10 kata).
2. RANGKUMAN (rangkuman): Rangkuman komprehensif mencakup SEMUA topik penting.`,

  // Dikurangi 35 → 20 soal untuk hemat token & waktu
  quiz: `Kamu adalah asisten pembuat soal. Berdasarkan materi yang diberikan, buatlah PERSIS 20 soal pilihan ganda (4 pilihan jawaban).
Tingkat kesulitan: MENENGAH-SULIT. Uji pemahaman konsep, bukan hafalan.
Sertakan jawaban benar dan penjelasan singkat (1-2 kalimat) mengapa jawaban itu benar.`,

  // Dikurangi 20 → 15 flashcard minimum
  flashcard: `Kamu adalah asisten pembuat flashcard. Berdasarkan materi yang diberikan, buat minimal 15 flashcard untuk istilah dan definisi penting.
Depan: Istilah. Belakang: Penjelasan ringkas dan akurat.`,
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SCHEMAS = {
  summary: {
    type: Type.OBJECT,
    properties: {
      judul_materi: { type: Type.STRING },
      rangkuman:    { type: Type.STRING },
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
            pertanyaan:    { type: Type.STRING },
            pilihan:       { type: Type.ARRAY, items: { type: Type.STRING } },
            jawaban_benar: { type: Type.STRING },
            penjelasan:    { type: Type.STRING },
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
            depan:    { type: Type.STRING },
            belakang: { type: Type.STRING },
          },
          required: ["depan", "belakang"],
        },
      },
    },
    required: ["flashcards"],
  },
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateAndClean(
  data: any,
  action: string
): { valid: boolean; reason?: string } {
  if (!data || typeof data !== "object")
    return { valid: false, reason: "Respons bukan objek." };

  if (action === "summary") {
    if (
      !data.judul_materi?.trim() ||
      !data.rangkuman?.trim() ||
      data.rangkuman.length < 50
    )
      return { valid: false, reason: "Judul atau rangkuman kosong." };
  } else if (action === "quiz") {
    if (!Array.isArray(data.kuis) || data.kuis.length < 5)
      return { valid: false, reason: "Jumlah soal tidak cukup." };
    for (let i = 0; i < data.kuis.length; i++) {
      const q = data.kuis[i];
      if (
        !q.pertanyaan?.trim() ||
        !Array.isArray(q.pilihan) ||
        q.pilihan.length < 2 ||
        !q.jawaban_benar?.trim()
      )
        return { valid: false, reason: `Soal #${i + 1} tidak lengkap.` };
    }
  } else if (action === "flashcard") {
    if (!Array.isArray(data.flashcards) || data.flashcards.length < 5)
      return { valid: false, reason: "Flashcard tidak cukup." };
    for (let i = 0; i < data.flashcards.length; i++) {
      const f = data.flashcards[i];
      if (!f.depan?.trim() || !f.belakang?.trim())
        return { valid: false, reason: `Flashcard #${i + 1} tidak lengkap.` };
    }
  }

  return { valid: true };
}

// ─── 429 Rate-limit helper ────────────────────────────────────────────────────

function parseRetryAfterMs(error: any): number {
  try {
    const msg: string =
      typeof error?.message === "string" ? error.message : JSON.stringify(error);
    const match = msg.match(/retry in ([\d.]+)s/i);
    if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  } catch {
    // ignore
  }
  return 20_000;
}

// ─── Core AI call ─────────────────────────────────────────────────────────────

type GenerateInput =
  | { mode: "pdf"; base64: string }
  | { mode: "text"; extractedText: string; sourceLabel: string };

async function generateWithRetry(
  input: GenerateInput,
  action: "summary" | "quiz" | "flashcard",
  attempt = 0
): Promise<any> {
  const ai = getAiClient();
  const promptText = PROMPTS[action];

  const parts: any[] =
    input.mode === "pdf"
      ? [
          { inlineData: { mimeType: "application/pdf", data: input.base64 } },
          { text: promptText },
        ]
      : [
          {
            text: `Berikut adalah isi materi (${input.sourceLabel}) yang perlu dianalisis:\n\n---\n${input.extractedText}\n---\n\n${promptText}`,
          },
        ];

  let response: any;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: SCHEMAS[action] as any,
        temperature: attempt === 0 ? 0.7 : 0.9,
        // Matikan thinking mode → potong 15-30 detik latency
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
  } catch (err: any) {
    // Handle 429: baca retry-after dari pesan error, tunggu, lalu coba lagi
    const status = err?.status ?? err?.code;
    if (
      (status === 429 || status === "RESOURCE_EXHAUSTED") &&
      attempt < MAX_RETRIES
    ) {
      const waitMs = parseRetryAfterMs(err);
      console.warn(
        `[Stuby] Rate limited. Retry attempt ${attempt + 1} dalam ${waitMs}ms...`
      );
      await new Promise((res) => setTimeout(res, waitMs));
      return generateWithRetry(input, action, attempt + 1);
    }
    throw err;
  }

  const rawText = response.text ?? "";
  if (!rawText.trim()) throw new Error("AI mengembalikan respons kosong.");

  let parsed: any;
  try {
    parsed = JSON.parse(
      rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim()
    );
  } catch {
    if (attempt < MAX_RETRIES) return generateWithRetry(input, action, attempt + 1);
    throw new Error("Respons AI bukan JSON yang valid.");
  }

  const { valid, reason } = validateAndClean(parsed, action);
  if (!valid) {
    if (attempt < MAX_RETRIES) return generateWithRetry(input, action, attempt + 1);
    throw new Error(`Validasi gagal: ${reason}`);
  }

  return parsed;
}

// ─── File type detection ──────────────────────────────────────────────────────

function detectFileType(file: File) {
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  const byMime = FILE_TYPES[file.type];
  if (byMime) return byMime;
  const byExt = ALLOWED_EXTS[ext];
  if (byExt) return { strategy: byExt.strategy, ext, label: byExt.label };
  return null;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let action: "summary" | "quiz" | "flashcard" = "summary";

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    action =
      (formData.get("action") as "summary" | "quiz" | "flashcard") || "summary";

    if (!file || !(file instanceof File))
      return NextResponse.json(
        { error: "Tidak ada dokumen yang dikirim." },
        { status: 400 }
      );

    if (file.size > MAX_FILE_SIZE_BYTES)
      return NextResponse.json(
        { error: `Ukuran dokumen melebihi batas ${MAX_FILE_SIZE_MB}MB.` },
        { status: 413 }
      );

    const fileType = detectFileType(file);
    if (!fileType)
      return NextResponse.json(
        {
          error:
            "Format dokumen tidak didukung. Gunakan PDF, PPTX, DOCX, ODP, atau ODT.",
        },
        { status: 415 }
      );

    const buffer = Buffer.from(await file.arrayBuffer());
    let generateInput: GenerateInput;

    if (fileType.strategy === "native-pdf") {
      generateInput = { mode: "pdf", base64: buffer.toString("base64") };
    } else {
      let extractedText: string;
      try {
        const extHint = fileType.ext.replace(".", "");
        const ast: any = await parseOffice(buffer, { fileType: extHint as any });
        extractedText =
          typeof ast === "string"
            ? ast
            : ast?.toText
            ? ast.toText()
            : JSON.stringify(ast);

        if (!extractedText || extractedText.trim().length < 20)
          throw new Error("Teks hasil ekstraksi terlalu pendek atau kosong.");
      } catch (e: any) {
        console.error("[Stuby] Gagal ekstrak teks:", e?.message);
        return NextResponse.json(
          {
            error:
              "Gagal membaca isi dokumen. Pastikan file tidak terproteksi password.",
          },
          { status: 422 }
        );
      }
      generateInput = {
        mode: "text",
        extractedText,
        sourceLabel: fileType.label,
      };
    }

    const result = await generateWithRetry(generateInput, action);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error(`[Stuby] Error API pada action [${action}]:`, error);

    const status = error?.status ?? error?.code;
    if (status === 429 || status === "RESOURCE_EXHAUSTED") {
      return NextResponse.json(
        { error: "Layanan AI sedang sibuk. Coba lagi dalam beberapa detik." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan server saat memproses AI. Coba lagi." },
      { status: 500 }
    );
  }
}