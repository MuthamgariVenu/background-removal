"use client";

import type { Metadata } from "next";
import { useState, useRef, useCallback } from "react";
import Spinner from "@/components/Spinner";

// Note: metadata export doesn't work in client components.
// SEO is handled via the Head approach or via a separate server wrapper.
// For simplicity we use a static title set in layout metadata template.

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export default function RemoveBackgroundPage() {
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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

      const res = await fetch("/api/remove-bg", {
        method: "POST",
        body: formData,
      });

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
            Drop your image here, or{" "}
            <span className="text-brand-500">browse</span>
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
                className="max-h-72 w-full rounded-xl object-contain"
              />
            </div>

            {/* Result */}
            <div className="card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Background Removed
              </p>
              {result ? (
                <>
                  {/* Checkerboard so transparent PNG looks right */}
                  <div
                    className="flex max-h-72 w-full items-center justify-center overflow-hidden rounded-xl"
                    style={{
                      backgroundImage:
                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23e5e7eb'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23e5e7eb'/%3E%3C/svg%3E\")",
                      backgroundSize: "16px 16px",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result}
                      alt="Result"
                      className="max-h-72 w-full object-contain"
                    />
                  </div>
                  <a
                    href={result}
                    download="removed-background.png"
                    className="btn-primary mt-4 w-full"
                  >
                    ⬇ Download PNG
                  </a>
                </>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
                  Result will appear here
                </div>
              )}
            </div>
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
