import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: "Kipu · Tu historia clínica, contigo", template: "%s · Kipu" },
  description:
    "Kipu reúne tus atenciones del Minsa, EsSalud y clínicas en una sola historia clínica. Tú decides quién la ve.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#11131a" },
  ],
};

const aplicarTema = `try{var t=localStorage.getItem("tema");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: aplicarTema }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#principal"
          className="absolute -top-16 left-4 z-[100] rounded-ctl bg-ink px-4 py-2 text-bg focus:top-4"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
