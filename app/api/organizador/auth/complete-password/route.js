import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  CHALLENGE_SESSION_COOKIE,
  CHALLENGE_USERNAME_COOKIE,
  authErrorMessage,
  clearChallengeCookies,
  cognitoApi,
  getCognitoClientId,
  isStrongPassword,
  noStoreJson,
  setAuthCookies,
} from '../shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const newPassword = typeof payload?.newPassword === 'string' ? payload.newPassword : '';
  if (!isStrongPassword(newPassword)) {
    return noStoreJson({ message: 'Use uma senha de 12 ou mais caracteres com maiúscula, minúscula, número e símbolo.' }, 400);
  }

  const cookieStore = await cookies();
  const session = cookieStore.get(CHALLENGE_SESSION_COOKIE)?.value;
  const username = cookieStore.get(CHALLENGE_USERNAME_COOKIE)?.value;
  if (!session || !username) {
    return noStoreJson({ message: 'Esta etapa expirou. Entre novamente com sua senha temporária.' }, 401);
  }

  try {
    const result = await cognitoApi('RespondToAuthChallenge', {
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ClientId: getCognitoClientId(),
      Session: session,
      ChallengeResponses: {
        USERNAME: username,
        NEW_PASSWORD: newPassword,
      },
    });

    if (result.ChallengeName) {
      const response = noStoreJson({ message: 'O Cognito solicitou outra etapa de segurança ainda não configurada.' }, 409);
      clearChallengeCookies(response);
      return response;
    }

    const response = NextResponse.json({ authenticated: true }, {
      headers: { 'cache-control': 'no-store, max-age=0' },
    });
    if (!setAuthCookies(response, result.AuthenticationResult)) {
      return noStoreJson({ message: 'O Cognito não retornou uma sessão válida. Entre novamente.' }, 502);
    }
    return response;
  } catch (error) {
    console.error('RIFOU organizer password change failed.', { name: error?.name || 'UnknownError' });
    const response = noStoreJson({ message: authErrorMessage(error) }, error?.name === 'NotAuthorizedException' ? 401 : 400);
    if (error?.name === 'NotAuthorizedException' || error?.name === 'ExpiredCodeException') {
      clearChallengeCookies(response);
    }
    return response;
  }
}
