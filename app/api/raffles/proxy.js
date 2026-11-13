const UPSTREAM_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export async function proxyRafflesRequest(request, {
  pathSegments = [],
  queryParams = [],
  method = 'GET',
  stripTrailingPathSegment = '',
} = {}) {
  const configuredEndpoint = process.env.RIFOU_AWS_RAFFLES_URL;
  if (!configuredEndpoint) {
    return Response.json({ message: 'A API de rifas não está configurada.' }, { status: 500 });
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(configuredEndpoint);
  } catch {
    console.error('RIFOU_AWS_RAFFLES_URL não contém uma URL válida.');
    return Response.json({ message: 'A API de rifas não está configurada corretamente.' }, { status: 500 });
  }

  if (upstreamUrl.protocol !== 'https:') {
    console.error('RIFOU_AWS_RAFFLES_URL precisa usar HTTPS.');
    return Response.json({ message: 'A API de rifas não está configurada corretamente.' }, { status: 500 });
  }

  const upstreamPath = upstreamUrl.pathname.split('/').filter(Boolean);
  if (stripTrailingPathSegment) {
    if (upstreamPath.at(-1) !== stripTrailingPathSegment) {
      console.error('RIFOU_AWS_RAFFLES_URL não termina com o caminho esperado.');
      return Response.json({ message: 'A API do RIFOU não está configurada corretamente.' }, { status: 500 });
    }
    upstreamPath.pop();
  }
  upstreamUrl.pathname = `/${[
    ...upstreamPath,
    ...pathSegments.map((segment) => encodeURIComponent(segment)),
  ].join('/')}`;

  const requestUrl = new URL(request.url);
  for (const key of queryParams) {
    const value = requestUrl.searchParams.get(key);
    if (value !== null) upstreamUrl.searchParams.set(key, value);
  }

  let body;
  const headers = { accept: 'application/json' };
  if (method !== 'GET') {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return Response.json({ message: 'O corpo da solicitação deve estar em JSON.' }, { status: 415 });
    }
    body = await request.text();
    headers['content-type'] = 'application/json';
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
    const responseBody = await upstreamResponse.text();
    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: {
        'content-type': upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8',
        ...UPSTREAM_HEADERS,
      },
    });
  } catch (error) {
    console.error('Falha ao consultar a API AWS de rifas.', error);
    return Response.json({ message: 'Não foi possível carregar as rifas agora.' }, { status: 502 });
  }
}

export function isValidRaffleId(raffleId) {
  return typeof raffleId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raffleId);
}
