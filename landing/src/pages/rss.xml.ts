import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { posts } from '../data/blog';

export async function GET(context: APIContext) {
  const list = await posts();
  return rss({
    title: 'TravelCRM Pro blog',
    description: 'Practical guides for travel agencies and tour operators.',
    site: context.site!,
    items: list.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: `/blog/${p.id}/`, categories: p.data.tags })),
  });
}
