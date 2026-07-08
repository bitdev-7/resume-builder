import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import AuthenticatedChrome from "@/components/AuthenticatedChrome";

export const metadata: Metadata = {
  title: "Resume Generator",
  description: "Generate optimized resumes tailored to job descriptions with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>
          <AuthenticatedChrome>{children}</AuthenticatedChrome>
        </Providers>
      </body>
    </html>
  );
}
