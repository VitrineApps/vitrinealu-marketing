// HTML digest template for grouped carousels
import type { Carousel, CarouselItem } from '../../repository';

interface CarouselDigestRow {
  carousel: Carousel;
  items: CarouselItem[];
  platform: string;
  scheduledAt: Date;
  caption: string;
  approveUrl: string;
  rejectUrl: string;
}

export function renderCarouselRow(row: CarouselDigestRow): string {
  const thumbs = row.items.slice(0, 5).map(item =>
    `<img src="${item.media_path}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;margin-right:2px;" alt="thumb">`
  ).join('');
  return `
    <tr>
      <td>${thumbs}</td>
      <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.caption.slice(0, 120)}${row.caption.length > 120 ? '…' : ''}</td>
      <td>${row.platform}</td>
      <td>${row.scheduledAt.toLocaleString()}</td>
      <td>
        <a href="${row.approveUrl}" style="color:#fff;background:#28a745;padding:6px 12px;border-radius:4px;text-decoration:none;">Approve</a>
        <a href="${row.rejectUrl}" style="color:#fff;background:#dc3545;padding:6px 12px;border-radius:4px;text-decoration:none;margin-left:8px;">Reject</a>
      </td>
    </tr>
  `;
}

export function renderCarouselTable(rows: CarouselDigestRow[]): string {
  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr>
          <th>Media</th>
          <th>Caption</th>
          <th>Platform</th>
          <th>Scheduled</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(renderCarouselRow).join('')}
      </tbody>
    </table>
  `;
}
