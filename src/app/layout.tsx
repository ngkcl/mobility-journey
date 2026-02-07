import type { Metadata } from "next";
import { Sora, Fraunces } from "next/font/google";
import { ToastProvider } from "@/components/ToastProvider";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "Mobility Journey - Posture & Scoliosis Tracking",
  description: "Track your posture correction, scoliosis treatment, and mobility improvement journey",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${fraunces.variable} antialiased`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
