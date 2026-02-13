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
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
