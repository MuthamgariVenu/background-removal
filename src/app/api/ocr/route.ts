import { NextRequest, NextResponse } from "next/server";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing OCR_SPACE_API_KEY." },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No image provided." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File size exceeds the 5 MB limit." },
      { status: 413 }
    );
  }

  // Forward to OCR.space
  const upstream = new FormData();
  upstream.append("file", file, "image.png");
  upstream.append("language", "eng");
  upstream.append("isOverlayRequired", "false");
  upstream.append("detectOrientation", "true");
  upstream.append("scale", "true");
  upstream.append("OCREngine", "2");

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey },
      body: upstream,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach OCR service. Check your internet connection." },
      { status: 502 }
    );
  }

  if (!upstreamRes.ok) {
    return NextResponse.json(
      { error: `OCR service returned ${upstreamRes.status}` },
      { status: upstreamRes.status }
    );
  }

  let json: {
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
    ParsedResults?: Array<{ ParsedText?: string }>;
  };
  try {
    json = await upstreamRes.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid response from OCR service." },
      { status: 502 }
    );
  }

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(" ")
      : json.ErrorMessage ?? "OCR processing failed.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const text =
    json.ParsedResults?.map((r) => r.ParsedText ?? "").join("\n").trim() ??
    "";

  return NextResponse.json({ text: text || "No text found in the image." });
}
