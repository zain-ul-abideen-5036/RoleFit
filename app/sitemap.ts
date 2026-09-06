import type { MetadataRoute } from 'next'

/**
 * Sitemap.
 *
 * Public pages only. Authenticated routes are excluded here and additionally
 * carry `robots: { index: false }` in their own metadata, so a crawler that
 * reaches one anyway is still told not to index it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const lastModified = new Date()

  return [
    { url: `${base}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/ai-disclaimer`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
  ]
}
