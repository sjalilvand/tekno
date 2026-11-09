"use client";
// ثبت سرویس‌ورکر PWA + تشخیص حالت نصب‌شده — یک بار در ریشهٔ برنامه
import * as React from "react";

export function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* نصب PWA اختیاری است — خطا نادیده گرفته می‌شود */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
