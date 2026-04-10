import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";
import Providers from "./providers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "ManageWise Business Operations",
  description:
    "A smart Business management application for employees and managers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Code+Pro&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen w-full overflow-x-hidden font-body antialiased" suppressHydrationWarning>
        <Providers>
          <FirebaseErrorListener />

          <div className="flex min-h-screen w-full flex-col">
            <main className="flex-1 w-full">{children}</main>

            <footer className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
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