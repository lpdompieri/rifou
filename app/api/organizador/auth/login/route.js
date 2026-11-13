import { NextResponse } from 'next/server';
import {
  authErrorMessage,
  cognitoApi,
  getCognitoClientId,
  isValidEmail,
  noStoreJson,
  setAuthCookies,
  setPasswordChallengeCookies,
} from '../shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const password = typeof payload?.password === 'string' ? payload.password : '';
  if (!isValidEmail(email) || password.length < 1 || password.length > 256) {
    return noStoreJson({ message: 'Informe seu e-mail e senha.' }, 400);
  }

  const missingConfig = [];
  if (!process.env.RIFOU_COGNITO_REGION && !process.env.AWS_REGION) missingConfig.push('RIFOU_COGNITO_REGION');
  if (!process.env.RIFOU_COGNITO_CLIENT_ID) missingConfig.push('RIFOU_COGNITO_CLIENT_ID');
  if (missingConfig.length) {
    console.error('RIFOU organizer sign-in is missing server configuration.', { variables: missingConfig });
    return noStoreJson({
      message: `Configuração do Cognito incompleta no servidor: ${missingConfig.join(', ')}. Atualize o .env.local e reinicie o Next.js.`,
    }, 500);
  }

  try {
    const result = await cognitoApi('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: getCognitoClientId(),
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    if (result.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      const response = noStoreJson({ challenge: 'NEW_PASSWORD_REQUIRED' });
      if (!setPasswordChallengeCookies(response, { session: result.Session, username: email })) {
        return noStoreJson({ message: 'A etapa de troca de senha não pôde ser iniciada. Tente entrar novamente.' }, 502);
      }
      return response;
    }

    if (result.ChallengeName) {
      return noStoreJson({ message: 'Este acesso exige uma etapa de segurança ainda não configurada no RIFOU.' }, 409);
    }

    const response = NextResponse.json({ authenticated: true }, {
      headers: { 'cache-control': 'no-store, max-age=0' },
    });
    if (!setAuthCookies(response, result.AuthenticationResult)) {
      return noStoreJson({ message: 'O Cognito não retornou uma sessão válida. Tente novamente.' }, 502);
    }
    return response;
  } catch (error) {
    console.error('RIFOU organizer sign-in failed.', {
      name: error?.name || 'UnknownError',
      requestId: error?.requestId || undefined,
    });
    const status = error?.name === 'TooManyRequestsException' || error?.name === 'LimitExceededException' ? 429
      : error?.name === 'NotAuthorizedException' || error?.name === 'UserNotFoundException' ? 401
        : error?.name === 'PasswordResetRequiredException' ? 409 : 503;
    return noStoreJson({ message: authErrorMessage(error) }, status);
  }
}
