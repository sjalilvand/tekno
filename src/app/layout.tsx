import type { Metadata } from "next";
import "./globals.css";
import "vazirmatn/Vazirmatn-font-face.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND.name} | سامانه مدیریت مشاوره و روان‌درمانی`,
  description: BRAND.description,
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%23A83A54'/><text x='50' y='68' font-size='52' text-anchor='middle' fill='white'>ر</text></svg>",
  },
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
