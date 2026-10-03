import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "FINTECHSTICO '26 — Consilium Business Conclave | NSUT",
  description:
    "Risk & Fraud Intelligence Architecture. Real-time scam detection, loan distress forecasting, dual-score SHAP explainability, and automated graduated interventions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakartaSans.variable} h-full`}>
      <body className="min-h-full bg-[#F5EFEB] text-[#141413] font-sans antialiased selection:bg-[#141413] selection:text-[#F5EFEB]">
        {children}
      </body>
    </html>
  );
}
