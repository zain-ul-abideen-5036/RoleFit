import type { Metadata, Viewport } from 'next'
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from 'next/font/google'

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
 * Three faces, each doing one job.
 *
 * A grotesque for the interface, a serif for display, and a monospace for
 * quoted source text. The third is not decoration: evidence from a resume is
 * shown verbatim, and a monospace face is what tells the reader they are
 * looking at the document rather than at our prose about it.
 */

const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-sans',
  // Variable font: one file covers the range, so this costs nothing extra.
  weight: ['400', '500', '600', '700'],
})

/**
 * Display only — headings and the score. Optical sizing is what makes a
 * serif work at interface sizes; without it the same face set at 14px looks
 * spindly and at 48px looks heavy.
 */
const display = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  // No `weight` here on purpose: next/font rejects `axes` alongside a fixed
  // weight list, and the whole point of this face is the variable axes. The
  // full weight range comes with the variable file.
  axes: ['SOFT', 'WONK', 'opsz'],
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
        {/* First tab stop on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
