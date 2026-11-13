import { proxyOrganizerRequest } from '../_proxy.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return proxyOrganizerRequest(request, {
    pathSegments: ['support-tickets'],
    queryParams: ['limit', 'nextToken'],
  });
}

export async function POST(request) {
  return proxyOrganizerRequest(request, {
    pathSegments: ['support-tickets'],
    method: 'POST',
  });
}
