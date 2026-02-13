import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { AiChat } from "@/components/AiChat";
import { MobileNav } from "@/components/MobileNav";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nirvana | Multi-Shop Command Center",
  description: "Advanced Inventory & Expense Management for Nirvana",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Nirvana",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow some scaling for accessibility
  userScalable: true,
  themeColor: "#8b5cf6", // Match manifest
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" crossOrigin="use-credentials" />
      </head>
      <body className={`${inter.className} antialiased bg-background text-foreground`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-8 pb-20 md:pb-8">
            {children}
          </main>
          <AiChat />
          <MobileNav />
          <ServiceWorkerRegistration />
        </div>
      </body>
    </html>
  );
}
