import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'

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

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
  weight: ['400', '500', '600', '700'],
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
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
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
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
