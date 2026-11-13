import { proxyRafflesRequest } from '../../raffles/proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  return proxyRafflesRequest(request, {
    pathSegments: ['organizer', 'access-requests'],
    stripTrailingPathSegment: 'raffles',
    method: 'POST',
  });
}
