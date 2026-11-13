import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authErrorMessage,
  clearAuthCookies,
  cognitoApi,
  getCognitoClientId,
  isCognitoAuthFailure,
  noStoreJson,
  setAuthCookies,
} from '../shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatUser(result) {
  const attributes = Object.fromEntries((result.UserAttributes || []).map(({ Name, Value }) => [Name, Value]));
  const email = attributes.email || result.Username || '';
  return {
    email,
    name: attributes.name || email.split('@')[0] || 'Organizador',
  };
}

async function loadUser(accessToken) {
  return cognitoApi('GetUser', { AccessToken: accessToken });
}

export async function GET() {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get(ACCESS_COOKIE)?.value || '';
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value || '';
  if (!accessToken && !refreshToken) {
    return noStoreJson({ authenticated: false }, 401);
  }

  try {
    if (accessToken) {
      try {
        const user = await loadUser(accessToken);
        return noStoreJson({ authenticated: true, user: formatUser(user) });
      } catch (error) {
        if (!refreshToken || !isCognitoAuthFailure(error)) throw error;
      }
    }

    const refreshed = await cognitoApi('GetTokensFromRefreshToken', {
      ClientId: getCognitoClientId(),
      RefreshToken: refreshToken,
    });
    const authenticationResult = refreshed.AuthenticationResult;
    const updatedTokens = {
      AccessToken: authenticationResult?.AccessToken,
      RefreshToken: authenticationResult?.RefreshToken || refreshToken,
      ExpiresIn: authenticationResult?.ExpiresIn,
    };
    if (!updatedTokens.AccessToken || !updatedTokens.RefreshToken) {
      const response = noStoreJson({ authenticated: false }, 401);
      clearAuthCookies(response);
      return response;
    }

    accessToken = updatedTokens.AccessToken;
    const user = await loadUser(accessToken);
    const response = noStoreJson({ authenticated: true, user: formatUser(user) });
    setAuthCookies(response, updatedTokens);
    return response;
  } catch (error) {
    console.error('RIFOU organizer session check failed.', { name: error?.name || 'UnknownError' });
    if (isCognitoAuthFailure(error)) {
      const response = noStoreJson({ authenticated: false }, 401);
      clearAuthCookies(response);
      return response;
    }
    return noStoreJson({ message: authErrorMessage(error) }, 503);
  }
}
