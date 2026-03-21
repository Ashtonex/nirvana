import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { StaffProvider } from "@/components/StaffProvider";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { ToastProvider } from "@/components/ToastProvider";
import { NotificationListener } from "@/components/NotificationListener";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nirvana | Multi-Shop Command Center",
  description: "Advanced Inventory & Expense Management for Nirvana",
  icons: {
    icon: [
      { url: "/logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/logo.png", type: "image/png" },
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
  maximumScale: 1,
  userScalable: false,
  themeColor: "#8b5cf6",
  viewportFit: "cover",
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
        <AuthProvider>
          <StaffProvider>
            <ToastProvider>
              <AppShell>
                <ServiceWorkerRegistration />
                <OfflineIndicator />
                <NotificationListener />
                {children}
              </AppShell>
            </ToastProvider>
          </StaffProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
