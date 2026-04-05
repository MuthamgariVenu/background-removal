import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Remove Background from Image",
  description:
    "Remove the background from any image instantly using AI. Free, fast, and no sign-up required.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
