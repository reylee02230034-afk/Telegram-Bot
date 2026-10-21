import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { addSubscriber, type OnlineEvent } from '@/lib/online-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: OnlineEvent) => {
        controller.enqueue(
          encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        );
      };

      prisma.teacherProfile
        .findMany({
          where: { isOnline: true, approvalStatus: 'APPROVED' },
          select: {
            id: true,
            displayName: true,
            latitude: true,
            longitude: true,
            isOnline: true,
            user: { select: { avatarUrl: true, username: true } },
          },
        })
        .then((teachers) => {
          send({
            type: 'snapshot',
            teachers: teachers.map((t: any) => ({
              id: t.id,
              displayName: t.displayName,
              latitude: Math.round((t.latitude + (Math.random() - 0.5) * 0.009) * 100) / 100,
              longitude: Math.round((t.longitude + (Math.random() - 0.5) * 0.009) * 100) / 100,
              avatarUrl: t.user?.avatarUrl,
              username: t.user?.username,
            })),
          });
        });

      const unsubscribe = addSubscriber(send);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': ping\n\n'));
      }, 25000);

      const cleanup = () => {
        unsubscribe();
        clearInterval(keepAlive);
      };

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
