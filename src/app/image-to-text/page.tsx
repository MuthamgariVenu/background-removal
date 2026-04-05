"use client";

import { useState, useRef, useCallback } from "react";
import Spinner from "@/components/Spinner";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export default function ImageToTextPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    setText(null);
    setCopied(false);
    setPreview(URL.createObjectURL(file));
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Server error: ${res.status}`);
      }

      const json = await res.json();
      setText(json.text ?? "No text found.");
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

  const copyText = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const reset = () => {
    setPreview(null);
    setText(null);
    setError(null);
    setCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
          Image to Text (OCR)
        </h1>
        <p className="mt-2 text-gray-600">
          Upload an image containing text and we&apos;ll extract it instantly. Max 5 MB.
        </p>
      </div>

      {/* Upload zone */}
      {!preview && (
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
          <div className="text-4xl">📄</div>
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
          <p className="text-sm">Extracting text…</p>
        </div>
      )}

      {/* Results */}
      {preview && !loading && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Image preview */}
            <div className="card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">
                Uploaded Image
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Uploaded"
                className="max-h-72 w-full rounded-xl object-contain"
              />
            </div>

            {/* Extracted text */}
            <div className="card flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Extracted Text
                </p>
                {text && (
                  <button
                    onClick={copyText}
                    className="btn-secondary py-1 px-3 text-xs"
                  >
                    {copied ? "✓ Copied!" : "Copy"}
                  </button>
                )}
              </div>
              {text ? (
                <textarea
                  readOnly
                  value={text}
                  className="flex-1 min-h-[200px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 focus:outline-none"
                />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
                  Text will appear here
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
