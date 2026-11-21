import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.jt-entertainment.org";

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/pageant`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/awards`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/vote`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/tickets`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/sponsors`, changeFrequency: "monthly", priority: 0.5 }
  ];
}
