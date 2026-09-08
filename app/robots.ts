import type { MetadataRoute } from 'next'

import { publicAppUrl } from '@/lib/config/public-url'

/**
 * robots.txt.
 *
 * The application, API and auth screens are disallowed. Nothing behind them is
 * reachable without a session, but keeping them out of crawl budget and out of
 * search results is still correct.
 */
export default function robots(): MetadataRoute.Robots {
  const base = publicAppUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/optimize',
          '/analysis/',
          '/resume/',
          '/history',
          '/settings',
          '/login',
          '/signup',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
