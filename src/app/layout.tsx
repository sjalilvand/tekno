import type { Metadata, Viewport } from "next";
import "./globals.css";
import "vazirmatn/Vazirmatn-font-face.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import { PwaRegister } from "@/components/pwa-register";

import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND.name} | سامانه مدیریت مشاوره و روان‌درمانی`,
  description: BRAND.description,
  manifest: "/manifest.json",
  applicationName: BRAND.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: BRAND.short,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#a83a54",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster />
          <PwaRegister />
        </ThemeProvider>
        {/*
          نمودارهای BPMN (diagram-js) برای اندازه‌گیری متن از helper-svg سراسری استفاده می‌کنند؛
          اگر خودش ساخته‌اش بدهد (۰×۰)، مرورگر Chrome عرض «منفی» برمی‌گرداند و لیبل‌ها جابه‌جا می‌شوند.
          با ساختن پیشینی با اندازهٔ واقعی، اندازه‌گیری درست می‌شود.
        */}
        <svg
          id="helper-svg"
          style={{ position: "fixed", visibility: "hidden", pointerEvents: "none", width: 1000, height: 1000, top: 0, left: 0, direction: "ltr" }}
          aria-hidden="true"
        />
      </body>
    </html>
  );
}
