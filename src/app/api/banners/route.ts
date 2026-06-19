import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Public banners endpoint — returns active banners ordered by sortOrder.
 * Optional `?placement=desktop|mobile|both` filter (defaults to all active).
 * No auth required (storefront reads this).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const placement = url.searchParams.get('placement');

  const where: Record<string, unknown> = { isActive: true };
  if (placement && placement !== 'all') {
    // Match banners that are either "both" or match the requested placement
    where.OR = [
      { placement: 'both' },
      { placement },
    ];
  }

  const banners = await db.banner.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  return NextResponse.json({ banners });
}
