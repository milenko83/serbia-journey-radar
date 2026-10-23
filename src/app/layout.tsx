import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Serbia Journey Radar",
  description: "Public-source transport disruption intelligence for Serbia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
