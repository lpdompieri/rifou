import { proxyOrganizerRequest } from '../../_proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  return proxyOrganizerRequest(request, {
    pathSegments: ['raffle-images', 'upload-url'],
    method: 'POST',
  });
}
