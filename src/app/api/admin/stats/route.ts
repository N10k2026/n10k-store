import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/admin-auth';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Admin stats must always be fresh — never cached.
  const headers = { 'Cache-Control': 'no-store, max-age=0' };

  const [
    productCount,
    reviewCount,
    newsletterCount,
    orderCount,
    orders,
    recentReviews,
    topProducts,
  ] = await Promise.all([
    db.product.count(),
    db.review.count(),
    db.newsletterSubscriber.count(),
    db.order.count(),
    db.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.review.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { product: { select: { name: true } } },
    }),
    db.product.findMany({
      orderBy: { rating: 'desc' },
      take: 5,
      select: { id: true, name: true, price: true, rating: true, image: true },
    }),
  ]);

  // Total revenue from all orders
  const revenueAgg = await db.order.aggregate({ _sum: { total: true } });
  const totalRevenue = revenueAgg._sum.total ?? 0;

  // Orders by status
  const ordersByStatusRaw = await db.order.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const ordersByStatus = ordersByStatusRaw.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    },
    {},
  );

  return NextResponse.json({
    counts: {
      products: productCount,
      reviews: reviewCount,
      newsletter: newsletterCount,
      orders: orderCount,
    },
    totalRevenue,
    ordersByStatus,
    recentOrders: orders,
    recentReviews,
    topProducts,
  }, { headers });
}
