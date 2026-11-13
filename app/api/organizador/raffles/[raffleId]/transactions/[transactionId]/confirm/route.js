import { isValidOrganizerRaffleId, proxyOrganizerRequest } from '../../../../../_proxy.js';

export async function POST(request, context) {
  const { raffleId, transactionId } = await context.params;
  if (!isValidOrganizerRaffleId(raffleId) || typeof transactionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(transactionId)) {
    return Response.json({ message: 'O identificador da participação é inválido.' }, { status: 400 });
  }

  return proxyOrganizerRequest(request, {
    pathSegments: ['raffles', raffleId, 'transactions', transactionId, 'confirm'],
    method: 'POST',
  });
}
