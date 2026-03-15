import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "TimeWise Employee Time Clock",
  description: "A smart time clock application for employees and managers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Code+Pro&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased" suppressHydrationWarning>
        <Providers>
          <FirebaseErrorListener />

          <div className="min-h-screen flex flex-col">
            <div className="flex-1">{children}</div>

            <footer className="border-t text-sm text-center py-6 text-muted-foreground">
              <a href="/privacy" className="mr-4 underline underline-offset-4">
                Privacy Policy
              </a>
              <a href="/terms" className="underline underline-offset-4">
                Terms &amp; Conditions
              </a>
            </footer>
          </div>

          <Toaster />
        </Providers>
      </body>
    </html>
  );
}