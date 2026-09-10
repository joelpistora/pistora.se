import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./styles/globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import HomeButton from "@/components/HomeButton";
import UserMenu from "@/components/UserMenu";

// Bricolage Grotesque gives the wordmark and headings a face; Hanken Grotesk
// carries body text; JetBrains Mono is the only other voice (filenames, paths,
// one-time passwords). All variable, self-hosted by next/font — no runtime
// request, no layout shift.
const display = Bricolage_Grotesque({
  variable: "--font-bricolage-grotesque",
  subsets: ["latin"],
});

const sans = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
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
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
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
