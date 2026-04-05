"use client";

import { useState, useRef, useCallback } from "react";
import Spinner from "@/components/Spinner";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const CHECKERBOARD = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='10' height='10' fill='%23d1d5db'/%3E%3Crect x='10' y='10' width='10' height='10' fill='%23d1d5db'/%3E%3Crect x='10' y='0' width='10' height='10' fill='%23f3f4f6'/%3E%3Crect x='0' y='10' width='10' height='10' fill='%23f3f4f6'/%3E%3C/svg%3E")`;

type BgOption = "transparent" | "white" | "black" | "custom";

const BG_OPTIONS: { id: BgOption; label: string; preview: string }[] = [
  { id: "transparent", label: "Transparent", preview: "checkerboard" },
  { id: "white",       label: "White",       preview: "#ffffff" },
  { id: "black",       label: "Black",       preview: "#000000" },
  { id: "custom",      label: "Custom",      preview: "custom" },
];

function bgStyle(bg: BgOption, custom: string): React.CSSProperties {
  if (bg === "transparent") {
    return { backgroundImage: CHECKERBOARD, backgroundSize: "20px 20px" };
  }
  if (bg === "white") return { backgroundColor: "#ffffff" };
  if (bg === "black") return { backgroundColor: "#000000" };
  return { backgroundColor: custom };
}

/** Draw image onto canvas with a solid background colour, return blob URL */
async function compositeToBlob(imgSrc: string, bgColor: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(new Error("Canvas export failed"));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imgSrc;
  });
}

export default function RemoveBackgroundPage() {
  const [original, setOriginal]     = useState<string | null>(null);
  const [result, setResult]         = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const [bg, setBg]                 = useState<BgOption>("white");
  const [customColor, setCustomColor] = useState("#4f6ef7");
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File size must be under 5 MB.");
      return;
    }
    setError(null);
    setResult(null);
    setOriginal(URL.createObjectURL(file));
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/remove-bg", { method: "POST", body: formData });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Server error: ${res.status}`);
      }
      const blob = await res.blob();
      setResult(URL.createObjectURL(blob));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const reset = () => {
    setOriginal(null);
    setResult(null);
    setError(null);
    setBg("white");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadWithBg = async () => {
    if (!result) return;
    if (bg === "transparent") {
      // Just download the original transparent PNG
      const a = document.createElement("a");
      a.href = result;
      a.download = "removed-background.png";
      a.click();
      return;
    }
    setDownloading(true);
    try {
      const color = bg === "custom" ? customColor : bg === "white" ? "#ffffff" : "#000000";
      const blobUrl = await compositeToBlob(result, color);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `removed-background-${bg}.png`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Failed to export image with background.");
    } finally {
      setDownloading(false);
    }
  };

  const activeBg = bgStyle(bg, customColor);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
          Remove Background
        </h1>
        <p className="mt-2 text-gray-600">
          Upload an image and we&apos;ll remove the background instantly. Max 5 MB.
        </p>
      </div>

      {/* Upload zone */}
      {!original && (
        <div
          className={`upload-zone ${dragOver ? "border-brand-500 bg-brand-50" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          aria-label="Upload image"
        >
          <div className="text-4xl">🖼️</div>
          <p className="font-semibold text-gray-700">
            Drop your image here, or <span className="text-brand-500">browse</span>
          </p>
          <p className="text-xs text-gray-400">PNG, JPG, WEBP · Max 5 MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-8 flex flex-col items-center gap-3 text-gray-600">
          <Spinner />
          <p className="text-sm">Removing background…</p>
        </div>
      )}

      {/* Results */}
      {original && !loading && (
        <div className="mt-8 space-y-6">
          {/* Side-by-side previews */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Original */}
            <div className="card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Original
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={original}
                alt="Original"
                className="max-h-72 w-full rounded-xl object-contain bg-gray-100"
              />
            </div>

            {/* Result with dynamic background */}
            <div className="card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Background Removed
              </p>
              {result ? (
                <div
                  className="flex max-h-72 w-full items-center justify-center overflow-hidden rounded-xl"
                  style={activeBg}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result}
                    alt="Result"
                    className="max-h-72 w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
                  Result will appear here
                </div>
              )}
            </div>
          </div>

          {/* Background options — only shown when result is ready */}
          {result && (
            <div className="card space-y-4">
              <p className="text-sm font-semibold text-gray-700">Background</p>

              {/* Option buttons */}
              <div className="flex flex-wrap gap-2">
                {BG_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setBg(opt.id)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition
                      ${bg === opt.id
                        ? "border-brand-500 bg-brand-50 text-brand-600 ring-1 ring-brand-500"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    {/* Swatch */}
                    {opt.preview === "checkerboard" ? (
                      <span
                        className="inline-block h-4 w-4 rounded-sm border border-gray-300"
                        style={{
                          backgroundImage: CHECKERBOARD,
                          backgroundSize: "8px 8px",
                        }}
                      />
                    ) : opt.preview === "custom" ? (
                      <span
                        className="inline-block h-4 w-4 rounded-sm border border-gray-300"
                        style={{ backgroundColor: customColor }}
                      />
                    ) : (
                      <span
                        className="inline-block h-4 w-4 rounded-sm border border-gray-300"
                        style={{ backgroundColor: opt.preview }}
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Custom color picker */}
              {bg === "custom" && (
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600" htmlFor="color-picker">
                    Pick a color:
                  </label>
                  <input
                    id="color-picker"
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="h-9 w-16 cursor-pointer rounded-lg border border-gray-300 p-0.5"
                  />
                  <span className="font-mono text-sm text-gray-500">{customColor}</span>
                </div>
              )}
            </div>
          )}

          {/* Download buttons */}
          {result && (
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {/* Transparent PNG — always available */}
              <a
                href={result}
                download="removed-background.png"
                className="btn-secondary text-center"
              >
                ⬇ Download Transparent PNG
              </a>

              {/* Download with chosen background */}
              <button
                onClick={downloadWithBg}
                disabled={downloading}
                className="btn-primary"
              >
                {downloading ? (
                  <>
                    <Spinner /> Exporting…
                  </>
                ) : (
                  "⬇ Download with Background"
                )}
              </button>
            </div>
          )}

          <div className="flex justify-center">
            <button onClick={reset} className="btn-secondary">
              ↩ Try another image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
