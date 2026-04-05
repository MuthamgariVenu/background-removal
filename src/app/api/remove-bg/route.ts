import { NextRequest, NextResponse } from "next/server";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest) {
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfiguration: missing REMOVE_BG_API_KEY." },
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

  // Forward to remove.bg
  const upstream = new FormData();
  upstream.append("image_file", file);
  upstream.append("size", "auto");

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": apiKey },
      body: upstream,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach remove.bg. Check your internet connection." },
      { status: 502 }
    );
  }

  if (!upstreamRes.ok) {
    let message = `remove.bg returned ${upstreamRes.status}`;
    try {
      const json = await upstreamRes.json();
      if (json?.errors?.[0]?.title) message = json.errors[0].title;
    } catch {
      // ignore
    }
    return NextResponse.json({ error: message }, { status: upstreamRes.status });
  }

  const imageBlob = await upstreamRes.arrayBuffer();

  return new NextResponse(imageBlob, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "attachment; filename=\"removed-background.png\"",
    },
  });
}
