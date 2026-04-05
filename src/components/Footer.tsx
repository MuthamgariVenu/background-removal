export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-400">
      © {new Date().getFullYear()} AI Image Tools · Powered by{" "}
      <a
        href="https://www.remove.bg"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gray-600"
      >
        remove.bg
      </a>{" "}
      &amp;{" "}
      <a
        href="https://ocr.space"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gray-600"
      >
        OCR.space
      </a>
    </footer>
  );
}
