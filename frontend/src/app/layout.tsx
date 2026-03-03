import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PriceProvider } from "@/context/PriceContext";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Gastown Finance",
  description: "Real-time trading dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="h-screen bg-bg-primary text-text-primary antialiased flex flex-col overflow-hidden">
        <Providers>
          <PriceProvider>
            <Header />
            <main className="flex-1 overflow-hidden">{children}</main>
          </PriceProvider>
        </Providers>
      </body>
    </html>
  );
}
