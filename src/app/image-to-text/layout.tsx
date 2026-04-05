import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Image to Text — OCR",
  description:
    "Extract text from any image using AI-powered OCR. Supports screenshots, scans, and photos.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
