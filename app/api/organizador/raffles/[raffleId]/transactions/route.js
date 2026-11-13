import { isValidOrganizerRaffleId, proxyOrganizerRequest } from '../../../_proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  const { raffleId } = await context.params;
  if (!isValidOrganizerRaffleId(raffleId)) {
    return Response.json({ message: 'O identificador da rifa é inválido.' }, { status: 400 });
  }
  return proxyOrganizerRequest(request, {
    pathSegments: ['raffles', raffleId, 'transactions'],
    queryParams: ['limit', 'nextToken'],
  });
}
