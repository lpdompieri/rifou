import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from './auth/shared.js';

const RESPONSE_HEADERS = {
  'cache-control': 'no-store, max-age=0',
  'x-content-type-options': 'nosniff',
};

export async function proxyOrganizerRequest(request, {
  pathSegments = [],
  method = 'GET',
  queryParams = [],
} = {}) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return Response.json({ message: 'Sua sessão expirou. Entre novamente para continuar.' }, {
      status: 401,
      headers: RESPONSE_HEADERS,
    });
  }

  const configuredEndpoint = process.env.RIFOU_AWS_RAFFLES_URL;
  if (!configuredEndpoint) {
    return Response.json({ message: 'A API do RIFOU não está configurada.' }, { status: 500, headers: RESPONSE_HEADERS });
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(configuredEndpoint);
  } catch {
    return Response.json({ message: 'A API do RIFOU não está configurada corretamente.' }, { status: 500, headers: RESPONSE_HEADERS });
  }
  if (upstreamUrl.protocol !== 'https:') {
    return Response.json({ message: 'A API do RIFOU precisa usar HTTPS.' }, { status: 500, headers: RESPONSE_HEADERS });
  }

  const path = upstreamUrl.pathname.split('/').filter(Boolean);
  if (path.at(-1) !== 'raffles') {
    return Response.json({ message: 'A URL da API do RIFOU deve terminar em /raffles.' }, { status: 500, headers: RESPONSE_HEADERS });
  }
  path.pop();
  upstreamUrl.pathname = `/${[...path, 'organizer', ...pathSegments.map((part) => encodeURIComponent(part))].join('/')}`;
  const requestUrl = new URL(request.url);
  for (const key of queryParams) {
    const value = requestUrl.searchParams.get(key);
    if (value !== null) upstreamUrl.searchParams.set(key, value);
  }

  const headers = { accept: 'application/json', authorization: `Bearer ${accessToken}` };
  let body;
  if (method !== 'GET') {
    if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      return Response.json({ message: 'O corpo da solicitação deve estar em JSON.' }, { status: 415, headers: RESPONSE_HEADERS });
    }
    body = await request.text();
    headers['content-type'] = 'application/json';
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, { method, headers, body, cache: 'no-store' });
    const responseBody = await upstreamResponse.text();
    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: {
        'content-type': upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8',
        ...RESPONSE_HEADERS,
      },
    });
  } catch (error) {
    console.error('Falha ao consultar a API autenticada do organizador.', { name: error?.name || 'UnknownError' });
    return Response.json({ message: 'Não foi possível carregar os dados do organizador agora.' }, { status: 502, headers: RESPONSE_HEADERS });
  }
}

export function isValidOrganizerRaffleId(raffleId) {
  return typeof raffleId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raffleId);
}
