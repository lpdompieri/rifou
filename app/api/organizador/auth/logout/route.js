import { cookies } from 'next/headers';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  cognitoApi,
  getCognitoClientId,
  noStoreJson,
} from '../shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      await cognitoApi('RevokeToken', {
        ClientId: getCognitoClientId(),
        Token: refreshToken,
      });
    } catch (error) {
      console.error('RIFOU organizer sign-out token revocation failed.', { name: error?.name || 'UnknownError' });
    }
  }

  const response = noStoreJson({ authenticated: false });
  clearAuthCookies(response);
  return response;
}
