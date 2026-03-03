import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PriceProvider } from "@/context/PriceContext";
import { ChatPanel } from "@/components/chat";

export const metadata: Metadata = {
  title: "Gastown Finance",
  description: "Real-time trading dashboard",
};

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3 bg-bg-secondary">
      <div className="flex items-center gap-3">
        <span className="text-xl font-bold text-accent-yellow">
          Gastown Finance
        </span>
      </div>
      <nav className="flex items-center gap-6 text-sm text-text-secondary">
        <a href="/" className="hover:text-text-primary transition-colors">
          Dashboard
        </a>
        <a href="/trade" className="hover:text-text-primary transition-colors">
          Trade
        </a>
      </nav>
    </header>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        <Header />
        <Providers>
          <PriceProvider>
            <main className="flex-1">{children}</main>
            <ChatPanel />
          </PriceProvider>
        </Providers>
      </body>
    </html>
  );
}
