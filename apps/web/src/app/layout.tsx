import type { Metadata, Viewport } from "next";
import { Big_Shoulders, JetBrains_Mono } from "next/font/google";
import "./styles/globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import HomeButton from "@/components/HomeButton";
import UserMenu from "@/components/UserMenu";

// Big Shoulders (uppercase, condensed, regular weight — no heading carries
// font-semibold) carries the wordmark and every heading; JetBrains Mono is
// the whole site's body/code voice — a deliberately brutalist pairing. Both
// self-hosted by next/font — no runtime request, no layout shift. Google's
// "Big Shoulders Display" isn't a separate next/font export — it's this
// family's `opsz` (optical size) axis, which auto-leans toward the Display
// cut at the large sizes headings use.
const display = Big_Shoulders({
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-big-shoulders-display",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pistora Web",
  description: "Pistora home server — file storage and more.",
};

/** Browser UI chrome (mobile address bar) follows the Fog & Steel ground. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#111417" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <AuthProvider>
          <HomeButton />
          <UserMenu />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
