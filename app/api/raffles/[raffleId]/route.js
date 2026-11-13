import { isValidRaffleId, proxyRafflesRequest } from '../proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { raffleId } = await params;
  if (!isValidRaffleId(raffleId)) {
    return Response.json({ message: 'O identificador da rifa é inválido.' }, { status: 400 });
  }

  return proxyRafflesRequest(request, { pathSegments: [raffleId] });
}
