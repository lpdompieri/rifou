import { proxyOrganizerRequest } from '../_proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request) {
  return proxyOrganizerRequest(request, {
    pathSegments: ['home-featured-raffle'],
    method: 'PUT',
  });
}
