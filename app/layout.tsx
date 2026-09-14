import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Shantell_Sans, Geist_Mono, Lora, Inter } from "next/font/google";
import "./globals.css";
import "@/lib/env";
import { AppearanceProvider } from "@/lib/appearance/appearance-context";
import { getAppearanceBootstrapScript } from "@/lib/appearance/appearance-bootstrap";
import { clerkAppearance } from "@/lib/clerk-appearance";

// Spec 20 Appearance — Font Family's three curated choices. Each gets its
// own CSS variable rather than sharing `--font-sans` directly, so
// `globals.css` can switch which one `--font-sans` actually points to via
// `[data-font-family]` — see that file's Appearance section.
const shantellSans = Shantell_Sans({
  variable: "--font-cozy",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-formal",
  subsets: ["latin", "latin-ext"],
});

const inter = Inter({
  variable: "--font-standard",
  subsets: ["latin", "latin-ext"],
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
      className={`${shantellSans.variable} ${lora.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Spec 20 Appearance — "Avoid Theme Flash": must run before the body paints, so it lives directly in <head> rather than anywhere hydration-ordered. */}
        <script dangerouslySetInnerHTML={{ __html: getAppearanceBootstrapScript() }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppearanceProvider>
          <ClerkProvider appearance={clerkAppearance}>
            {children}
          </ClerkProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
