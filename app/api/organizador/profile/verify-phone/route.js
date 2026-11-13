import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  authErrorMessage,
  clearAuthCookies,
  cognitoApi,
  isCognitoAuthFailure,
  noStoreJson,
} from '../../auth/shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value || '';
  if (!accessToken) return noStoreJson({ authenticated: false }, 401);

  const payload = await request.json().catch(() => null);
  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  if (!/^\d{4,8}$/.test(code)) return noStoreJson({ message: 'Informe o código de verificação recebido por SMS.' }, 400);

  try {
    await cognitoApi('VerifyUserAttribute', { AccessToken: accessToken, AttributeName: 'phone_number', Code: code });
    const profile = await cognitoApi('GetUser', { AccessToken: accessToken });
    const attributes = Object.fromEntries((profile.UserAttributes || []).map(({ Name, Value }) => [Name, Value]));
    return noStoreJson({
      verified: attributes.phone_number_verified === 'true',
      profile: {
        name: attributes.name || '',
        email: attributes.email || profile.Username || '',
        emailVerified: attributes.email_verified === 'true',
        phone: attributes.phone_number || '',
        phoneVerified: attributes.phone_number_verified === 'true',
      },
    });
  } catch (error) {
    console.error('RIFOU organizer phone verification failed.', { name: error?.name || 'UnknownError' });
    if (isCognitoAuthFailure(error)) {
      const response = noStoreJson({ authenticated: false, message: 'Sua sessão expirou. Entre novamente.' }, 401);
      clearAuthCookies(response);
      return response;
    }
    const status = ['CodeMismatchException', 'ExpiredCodeException', 'InvalidParameterException'].includes(error?.name) ? 400 : 503;
    return noStoreJson({ message: authErrorMessage(error) }, status);
  }
}
