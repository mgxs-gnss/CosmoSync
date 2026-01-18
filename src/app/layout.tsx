import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CosmoSync - Realtime Multiplayer",
  description: "Realtime multiplayer position tracking with Supabase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
