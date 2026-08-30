import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Shantell_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const shantellSans = Shantell_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Polyglot",
  description: "A structured curriculum, SRS, and practice system for language learners.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${shantellSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}