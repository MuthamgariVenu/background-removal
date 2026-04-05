"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Spinner from "@/components/Spinner";
import type { DetectedPerson } from "@/lib/personDetection";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

// Checkerboard data-URI (20 × 20 tile, two greys)
const CHECKERBOARD = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='10' height='10' fill='%23d1d5db'/%3E%3Crect x='10' y='10' width='10' height='10' fill='%23d1d5db'/%3E%3Crect x='10' y='0' width='10' height='10' fill='%23f3f4f6'/%3E%3Crect x='0' y='10' width='10' height='10' fill='%23f3f4f6'/%3E%3C/svg%3E")`;

// One colour per person (cycles if > 5 detected)
const PERSON_COLORS = ["#4f6ef7", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

type Phase = "upload" | "detecting" | "selecting" | "processing" | "result";
type BgOption = "transparent" | "white" | "black" | "custom";

const BG_PRESETS: { id: BgOption; label: string; swatch: string }[] = [
  { id: "transparent", label: "Transparent", swatch: "checkerboard" },
  { id: "white",       label: "White",       swatch: "#ffffff" },
  { id: "black",       label: "Black",       swatch: "#000000" },
  { id: "custom",      label: "Custom",      swatch: "custom" },
];

function bgStyle(bg: BgOption, custom: string): React.CSSProperties {
  if (bg === "transparent")
    return { backgroundImage: CHECKERBOARD, backgroundSize: "20px 20px" };
  if (bg === "white") return { backgroundColor: "#ffffff" };
  if (bg === "black") return { backgroundColor: "#000000" };
  return { backgroundColor: custom };
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────

const MAX_CANVAS_W = 900;
const MAX_CANVAS_H = 520;

function drawOverlay(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  persons: DetectedPerson[],
  selectedIds: Set<number>
) {
  const scale = Math.min(
    MAX_CANVAS_W / img.naturalWidth,
    MAX_CANVAS_H / img.naturalHeight,
    1
  );
  canvas.width  = Math.round(img.naturalWidth  * scale);
  canvas.height = Math.round(img.naturalHeight * scale);

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (!persons.length) return;

  for (const person of persons) {
    const color   = PERSON_COLORS[(person.id - 1) % PERSON_COLORS.length];
    const sel     = selectedIds.has(person.id);
    const bx      = person.bounds.x * canvas.width;
    const by      = person.bounds.y * canvas.height;
    const bw      = person.bounds.w * canvas.width;
    const bh      = person.bounds.h * canvas.height;
    const lw      = Math.max(2, canvas.width * 0.0022);

    // Tinted fill
    ctx.fillStyle = sel ? `${color}28` : "rgba(0,0,0,0.12)";
    ctx.fillRect(bx, by, bw, bh);

    // Border
    ctx.strokeStyle = sel ? color : "#9ca3af";
    ctx.lineWidth   = sel ? lw * 1.4 : lw;
    ctx.strokeRect(bx, by, bw, bh);

    // Label badge
    const bSize  = Math.max(22, canvas.width * 0.026);
    const fSize  = bSize * 0.52;
    const label  = `Person ${person.id}`;
    ctx.font     = `bold ${fSize}px sans-serif`;
    const tWidth = ctx.measureText(label).width + bSize * 0.8;

    ctx.fillStyle = sel ? color : "#6b7280";
    ctx.fillRect(bx, by, tWidth, bSize);

    ctx.fillStyle    = "#fff";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "left";
    ctx.fillText(label, bx + bSize * 0.4, by + bSize * 0.5);
  }
}

// Composite a transparent PNG with a solid background colour → new blob URL
async function compositeToBlob(src: string, bgColor: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Export failed"))),
        "image/png"
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RemoveBackgroundPage() {
  const [phase, setPhase]           = useState<Phase>("upload");
  const [file, setFile]             = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [persons, setPersons]       = useState<DetectedPerson[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [resultUrl, setResultUrl]   = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const [bg, setBg]                 = useState<BgOption>("white");
  const [customColor, setCustomColor] = useState("#4f6ef7");
  const [downloading, setDownloading] = useState(false);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const loadedImgRef  = useRef<HTMLImageElement | null>(null);

  // Redraw bounding-box overlay whenever selection changes
  useEffect(() => {
    if (phase !== "selecting" || !canvasRef.current || !loadedImgRef.current) return;
    drawOverlay(canvasRef.current, loadedImgRef.current, persons, selectedIds);
  }, [phase, persons, selectedIds]);

  // ── File ingestion ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith("image/")) { setError("Please upload a valid image."); return; }
    if (f.size > MAX_SIZE)            { setError("File size must be under 5 MB."); return; }

    setError(null);
    setFile(f);
    setPersons([]);
    setSelectedIds(new Set());
    setResultUrl(null);

    const url = URL.createObjectURL(f);
    setOriginalUrl(url);
    setPhase("detecting");

    // Load HTMLImageElement for TF.js
    const imgEl = await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload  = () => res(img);
      img.onerror = rej;
      img.src     = url;
    });
    loadedImgRef.current = imgEl;

    try {
      const { detectPersons } = await import("@/lib/personDetection");
      const detected = await detectPersons(imgEl);
      setPersons(detected);
      setSelectedIds(new Set(detected.map((p) => p.id)));
    } catch (err) {
      console.error("Person detection failed:", err);
      // Non-fatal: proceed without person selection
      setPersons([]);
      setSelectedIds(new Set());
    }

    setPhase("selecting");
  }, []);

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  const togglePerson = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // always keep at least one
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(persons.map((p) => p.id)));

  // ── Canvas click → select person ───────────────────────────────────────────
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !persons.length) return;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvas.height / rect.height);

    for (const person of persons) {
      const bx = person.bounds.x * canvas.width;
      const by = person.bounds.y * canvas.height;
      const bw = person.bounds.w * canvas.width;
      const bh = person.bounds.h * canvas.height;
      if (cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh) {
        togglePerson(person.id);
        break;
      }
    }
  };

  // ── Background removal ──────────────────────────────────────────────────────
  const removeBackground = async () => {
    if (!file) return;
    setPhase("processing");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/remove-bg", { method: "POST", body: formData });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Server error: ${res.status}`);
      }

      const blob = await res.blob();
      let url = URL.createObjectURL(blob);

      // Apply per-person filter when a subset is selected
      if (persons.length > 1 && selectedIds.size > 0 && selectedIds.size < persons.length) {
        const { applyPersonFilter } = await import("@/lib/personDetection");
        url = await applyPersonFilter(url, persons, selectedIds);
      }

      setResultUrl(url);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("selecting");
    }
  };

  // ── Download with background ────────────────────────────────────────────────
  const downloadWithBg = async () => {
    if (!resultUrl) return;
    if (bg === "transparent") {
      triggerDownload(resultUrl, "removed-background.png");
      return;
    }
    setDownloading(true);
    try {
      const color = bg === "white" ? "#ffffff" : bg === "black" ? "#000000" : customColor;
      const blobUrl = await compositeToBlob(resultUrl, color);
      triggerDownload(blobUrl, `removed-background-${bg}.png`);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Failed to export image with background.");
    } finally {
      setDownloading(false);
    }
  };

  const reset = () => {
    setPhase("upload");
    setFile(null);
    setOriginalUrl(null);
    setPersons([]);
    setSelectedIds(new Set());
    setResultUrl(null);
    setError(null);
    setBg("white");
    loadedImgRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const allSelected = persons.length > 0 && selectedIds.size === persons.length;
  const activeBg    = bgStyle(bg, customColor);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
          Remove Background
        </h1>
        <p className="mt-2 text-gray-600">
          Upload an image — AI detects each person so you can choose exactly who to keep. Max 5 MB.
        </p>
      </div>

      {/* ── Upload zone ── */}
      {phase === "upload" && (
        <div
          className={`upload-zone ${dragOver ? "border-brand-500 bg-brand-50" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          aria-label="Upload image"
        >
          <div className="text-4xl">🖼️</div>
          <p className="font-semibold text-gray-700">
            Drop your image here, or{" "}
            <span className="text-brand-500">browse</span>
          </p>
          <p className="text-xs text-gray-400">PNG, JPG, WEBP · Max 5 MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* ── Detecting spinner ── */}
      {phase === "detecting" && (
        <div className="card mt-4 flex flex-col items-center gap-4 py-14">
          <Spinner />
          <div className="text-center">
            <p className="font-semibold text-gray-800">Detecting people…</p>
            <p className="text-sm text-gray-500">
              Loading AI model — may take a moment on first run
            </p>
          </div>
        </div>
      )}

      {/* ── Selecting phase ── */}
      {phase === "selecting" && (
        <div className="mt-4 space-y-5">
          {/* Canvas preview with bounding boxes */}
          <div className="card overflow-hidden p-2 sm:p-3">
            <canvas
              ref={canvasRef}
              className={`block w-full rounded-xl ${persons.length > 0 ? "cursor-pointer" : ""}`}
              style={{ height: "auto" }}
              onClick={handleCanvasClick}
              title={
                persons.length > 0
                  ? "Click a person's box to toggle selection"
                  : undefined
              }
            />
          </div>

          {/* Person selection panel */}
          {persons.length > 0 ? (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {persons.length} {persons.length === 1 ? "person" : "people"} detected
                  &nbsp;— select who to keep:
                </p>
                {!allSelected && (
                  <button
                    onClick={selectAll}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Select all
                  </button>
                )}
              </div>

              {/* Toggle buttons */}
              <div className="flex flex-wrap gap-2">
                {/* ALL button */}
                <button
                  onClick={selectAll}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition
                    ${allSelected
                      ? "border-brand-500 bg-brand-50 text-brand-600 ring-1 ring-brand-500"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                >
                  All
                </button>

                {/* Per-person buttons */}
                {persons.map((person, i) => {
                  const color = PERSON_COLORS[i % PERSON_COLORS.length];
                  const sel   = selectedIds.has(person.id);
                  return (
                    <button
                      key={person.id}
                      onClick={() => togglePerson(person.id)}
                      style={
                        sel
                          ? { backgroundColor: color, borderColor: color, boxShadow: `0 0 0 1px ${color}` }
                          : {}
                      }
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition
                        ${sel
                          ? "text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: sel ? "rgba(255,255,255,0.85)" : color }}
                      />
                      Person {person.id}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">
                Tip: click the coloured boxes on the image above to toggle selection.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200">
              No people detected — background will be removed from all subjects.
            </div>
          )}

          <button
            onClick={removeBackground}
            disabled={persons.length > 0 && selectedIds.size === 0}
            className="btn-primary w-full"
          >
            ✂️ Remove Background
          </button>
        </div>
      )}

      {/* ── Processing spinner ── */}
      {phase === "processing" && (
        <div className="card mt-4 flex flex-col items-center gap-4 py-14">
          <Spinner />
          <p className="text-sm text-gray-600">Removing background…</p>
        </div>
      )}

      {/* ── Result ── */}
      {phase === "result" && originalUrl && resultUrl && (
        <div className="mt-4 space-y-5">
          {/* Side-by-side comparison */}
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Original */}
            <div className="card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Original
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={originalUrl}
                alt="Original"
                className="max-h-72 w-full rounded-xl object-contain bg-gray-100"
              />
            </div>

            {/* Result with chosen background */}
            <div className="card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Background Removed
              </p>
              <div
                className="flex max-h-72 w-full items-center justify-center overflow-hidden rounded-xl"
                style={activeBg}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultUrl}
                  alt="Result"
                  className="max-h-72 w-full object-contain"
                />
              </div>
            </div>
          </div>

          {/* Background options */}
          <div className="card space-y-4">
            <p className="text-sm font-semibold text-gray-700">Preview background</p>
            <div className="flex flex-wrap gap-2">
              {BG_PRESETS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setBg(opt.id)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition
                    ${bg === opt.id
                      ? "border-brand-500 bg-brand-50 text-brand-600 ring-1 ring-brand-500"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                >
                  {opt.swatch === "checkerboard" ? (
                    <span
                      className="inline-block h-4 w-4 shrink-0 rounded-sm border border-gray-300"
                      style={{ backgroundImage: CHECKERBOARD, backgroundSize: "8px 8px" }}
                    />
                  ) : (
                    <span
                      className="inline-block h-4 w-4 shrink-0 rounded-sm border border-gray-300"
                      style={{ backgroundColor: opt.swatch === "custom" ? customColor : opt.swatch }}
                    />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>

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

          {/* Download buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href={resultUrl}
              download="removed-background.png"
              className="btn-secondary text-center"
            >
              ⬇ Download Transparent PNG
            </a>
            <button
              onClick={downloadWithBg}
              disabled={downloading}
              className="btn-primary"
            >
              {downloading ? (
                <><Spinner /> Exporting…</>
              ) : (
                "⬇ Download with Background"
              )}
            </button>
          </div>

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

// ─── Utility ─────────────────────────────────────────────────────────────────

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}
