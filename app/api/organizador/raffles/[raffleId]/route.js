import { isValidOrganizerRaffleId, proxyOrganizerRequest } from '../../_proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function rafflePath(context) {
  const { raffleId } = await context.params;
  return isValidOrganizerRaffleId(raffleId) ? raffleId : null;
}

export async function GET(request, context) {
  const raffleId = await rafflePath(context);
  if (!raffleId) return Response.json({ message: 'O identificador da rifa é inválido.' }, { status: 400 });
  return proxyOrganizerRequest(request, { pathSegments: ['raffles', raffleId] });
}

export async function PATCH(request, context) {
  const raffleId = await rafflePath(context);
  if (!raffleId) return Response.json({ message: 'O identificador da rifa é inválido.' }, { status: 400 });
  return proxyOrganizerRequest(request, { pathSegments: ['raffles', raffleId], method: 'PATCH' });
}
