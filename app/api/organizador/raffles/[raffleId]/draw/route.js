import { proxyOrganizerRequest } from '../../../_proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const { raffleId } = await context.params;
  if (!raffleId || !/^[a-zA-Z0-9_-]{1,100}$/.test(raffleId)) {
    return Response.json({ message: 'O identificador da rifa é inválido.' }, { status: 400 });
  }
  return proxyOrganizerRequest(request, { pathSegments: ['raffles', raffleId, 'draw'], method: 'POST' });
}
