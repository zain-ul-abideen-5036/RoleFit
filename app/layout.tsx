import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from 'next/font/google'

import { ThemeScript } from '@/components/theme/theme-script'
import { publicAppUrl, publicAppUrlObject } from '@/lib/config/public-url'
import { PRODUCT } from '@/lib/constants'

import './globals.css'

/**
 * Root layout.
 *
 * Fonts are self-hosted by `next/font` at build time, which keeps the CSP free
 * of a third-party font origin and removes the render-blocking request to
 * Google Fonts.
 */

/**
 * Three faces, each doing one job, with a boundary each does not cross.
 *
 *   sans     every interface surface, and all body copy
 *   serif    marketing and auth headlines only — never product chrome
 *   mono     text quoted from a document, and machine identifiers
 *
 * The monospace is not decoration: evidence from a resume is shown verbatim,
 * and a monospace face is what tells the reader they are looking at the
 * document rather than at our prose about it.
 *
 * Instrument Sans and Instrument Serif are one design programme rather than
 * two faces that happen to sit together, which is what keeps the pairing from
 * reading as two arbitrary picks off a font host.
 */

const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-sans',
  // Variable font: one file covers the range, so this costs nothing extra.
  weight: ['400', '500', '600', '700'],
})

/**
 * Display only, and only on the persuasive surface: the landing headlines, the
 * auth panel, the policy page titles.
 *
 * Deliberately absent from the authenticated product. The previous revision
 * set dashboard panel headings and score figures in a soft, wonky serif, and
 * a serif on a data panel reads boutique-editorial where this product needs
 * to read as an instrument. One face carries the whole application.
 *
 * A single weight, because this is a display face used at display sizes. A
 * 400-weight serif set at 56px with tight negative tracking is authoritative;
 * the same face bolded is just heavier.
 */
const display = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-serif',
  weight: '400',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
})

const appUrl = publicAppUrl()

export const metadata: Metadata = {
  metadataBase: publicAppUrlObject(),
  title: {
    default: `${PRODUCT.name} — ${PRODUCT.tagline}`,
    template: `%s — ${PRODUCT.name}`,
  },
  description: PRODUCT.description,
  applicationName: PRODUCT.name,
  authors: [{ name: PRODUCT.owner }],
  keywords: [
    'resume optimization',
    'ATS resume',
    'job application',
    'resume tailoring',
    'job description matching',
    'ATS friendly resume',
  ],
  openGraph: {
    type: 'website',
    siteName: PRODUCT.name,
    title: `${PRODUCT.name} — ${PRODUCT.tagline}`,
    description: PRODUCT.description,
    url: appUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PRODUCT.name} — ${PRODUCT.tagline}`,
    description: PRODUCT.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled: pinch-to-zoom is an accessibility requirement.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d13' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">
        {/*
          First tab stop on every page.

          `z-[--z-toast]` rather than a bare z-50: the skip link has to clear
          every other layer including an open dialog, and picking a number by
          hand is how it ends up behind the drawer it exists to skip past.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[--z-toast] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-accent focus:shadow-lg"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
