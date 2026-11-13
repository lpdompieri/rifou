import { proxyRafflesRequest } from './proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  return proxyRafflesRequest(request, {
    queryParams: ['status', 'featured', 'limit', 'nextToken'],
  });
}
