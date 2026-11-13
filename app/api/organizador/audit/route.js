import { proxyOrganizerRequest } from '../_proxy.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return proxyOrganizerRequest(request, {
    pathSegments: ['audit'],
    queryParams: ['raffleId', 'action', 'from', 'to', 'limit', 'nextToken'],
  });
}
