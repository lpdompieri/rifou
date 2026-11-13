import { proxyOrganizerRequest } from '../_proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  return proxyOrganizerRequest(request, { pathSegments: ['raffles'], queryParams: ['limit', 'nextToken'] });
}

export async function POST(request) {
  return proxyOrganizerRequest(request, { pathSegments: ['raffles'], method: 'POST' });
}
