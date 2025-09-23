// Weekly digest job: include carousels grouped by platform and date
import { Repository, Carousel, CarouselItem } from '../repository';
import { renderCarouselTable } from '../email/templates/digest.html';

export async function generateWeeklyDigest({ start, end }: { start: Date; end: Date }) {
  const repo = new Repository();
  const carousels = repo.getCarouselsInRange(start, end);
  // Group by platform and date
  const grouped: Record<string, Carousel[]> = {};
  for (const c of carousels) {
    const dateStr = c.scheduled_at ? c.scheduled_at.toISOString().slice(0, 10) : '';
    const key = `${c.platform}|${dateStr}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  }
  // For each group, fetch items and render table
  let html = '';
  for (const key of Object.keys(grouped)) {
    const [platform, date] = key.split('|');
    const rows = grouped[key].map((carousel) => {
      const items: CarouselItem[] = repo.getCarouselItems(carousel.id);
      return {
        carousel,
        items,
        platform,
        scheduledAt: carousel.scheduled_at || new Date(),
        caption: carousel.caption,
        approveUrl: `https://yourdomain.com/webhooks/approval/carousel/${carousel.id}?action=approve&token=...`,
        rejectUrl: `https://yourdomain.com/webhooks/approval/carousel/${carousel.id}?action=reject&token=...`,
      };
    });
    html += `<h3>${platform} – ${date}</h3>` + renderCarouselTable(rows);
  }
  repo.close();
  return html;
}
