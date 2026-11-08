import type { Metadata } from "next";
import "./globals.css";
import "vazirmatn/Vazirmatn-font-face.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
  title: "سامانه راه زندگی | مراکز خدمات روانشناسی و مشاوره",
  description:
    "بازنویسی مدرن سامانه مراکز خدمات روانشناسی و مشاوره راه زندگی — مدیریت جلسات، ارجاعات، سهمیه‌ها و گزارش‌های مدیریتی",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%230D9488'/><text x='50' y='68' font-size='52' text-anchor='middle' fill='white'>ر</text></svg>",
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
      </body>
    </html>
  );
}
