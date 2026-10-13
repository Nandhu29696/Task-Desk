import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/client/ActionForm";
import { Clamps } from "@/components/client/Widgets";

export const metadata: Metadata = {
  title: { default: "TaskDesk", template: "%s · TaskDesk" },
  description: "Task management for the Search Engineers team",
  icons: { icon: "/logo.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FFFFFF" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Figtree:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {children}
        <Toaster />
        <Clamps />
      </body>
    </html>
  );
}
