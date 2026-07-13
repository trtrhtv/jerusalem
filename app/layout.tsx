import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ירושלים בשכבות זמן",
  description:
    "הדמיה מעוגנת-מקורות של ירושלים על פני מאות שנים — כל אלמנט מסומן במדרג ראיות: מתועד, טיפולוגי או השערה.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
