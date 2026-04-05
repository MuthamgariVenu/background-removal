import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Image Tools — Remove Background & OCR",
  description:
    "Free AI-powered tools to remove image backgrounds and extract text from images.",
};

const tools = [
  {
    href: "/remove-background",
    icon: "✂️",
    title: "Remove Background",
    description:
      "Instantly remove the background from any photo. Perfect for product images, portraits, and more.",
    cta: "Try it free",
    accent: "bg-violet-50 ring-violet-200",
    iconBg: "bg-violet-100",
  },
  {
    href: "/image-to-text",
    icon: "📝",
    title: "Image to Text (OCR)",
    description:
      "Extract text from images, screenshots, or scanned documents in seconds.",
    cta: "Try it free",
    accent: "bg-blue-50 ring-blue-200",
    iconBg: "bg-blue-100",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className="mb-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          AI-Powered{" "}
          <span className="text-brand-500">Image Tools</span>
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Fast, free, and privacy-friendly tools — everything runs through
          secure API calls, no account required.
        </p>
      </div>

      {/* Tool Cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className={`group flex flex-col rounded-2xl p-6 ring-1 transition hover:shadow-md ${tool.accent}`}
          >
            <div
              className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${tool.iconBg}`}
            >
              {tool.icon}
            </div>
            <h2 className="text-xl font-bold text-gray-900">{tool.title}</h2>
            <p className="mt-2 flex-1 text-sm text-gray-600">
              {tool.description}
            </p>
            <span className="mt-5 inline-flex items-center text-sm font-semibold text-brand-600 group-hover:underline">
              {tool.cta} →
            </span>
          </Link>
        ))}
      </div>

      {/* Features strip */}
      <div className="mt-16 grid gap-4 text-center sm:grid-cols-3">
        {[
          { icon: "⚡", label: "Instant results" },
          { icon: "🔒", label: "Private & secure" },
          { icon: "📱", label: "Works on mobile" },
        ].map((f) => (
          <div key={f.label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
            <div className="text-2xl">{f.icon}</div>
            <p className="mt-1 text-sm font-medium text-gray-700">{f.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
