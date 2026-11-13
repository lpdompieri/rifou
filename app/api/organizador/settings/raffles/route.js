import { proxyOrganizerRequest } from '../../_proxy.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  return proxyOrganizerRequest(request, { pathSegments: ['settings', 'raffles'] });
}

export async function PUT(request) {
  return proxyOrganizerRequest(request, { pathSegments: ['settings', 'raffles'], method: 'PUT' });
}
