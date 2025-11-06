import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../contexts/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atlas Assistant",
  description: "A streaming chat interface powered by LangGraph.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <body className="flex min-h-screen justify-center bg-atlas-body p-6 text-atlas-text md:p-12">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
