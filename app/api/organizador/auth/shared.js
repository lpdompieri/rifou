import { NextResponse } from 'next/server';

export const ACCESS_COOKIE = 'rifou_org_access';
export const REFRESH_COOKIE = 'rifou_org_refresh';
export const CHALLENGE_SESSION_COOKIE = 'rifou_org_challenge_session';
export const CHALLENGE_USERNAME_COOKIE = 'rifou_org_challenge_username';

const ACCESS_TOKEN_FALLBACK_SECONDS = 15 * 60;
const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60;

export function getCognitoRegion() {
  const region = process.env.RIFOU_COGNITO_REGION || process.env.AWS_REGION;
  if (!region) throw new Error('RIFOU_COGNITO_REGION is not configured.');
  return region;
}

export function getCognitoClientId() {
  const clientId = process.env.RIFOU_COGNITO_CLIENT_ID;
  if (!clientId) throw new Error('RIFOU_COGNITO_CLIENT_ID is not configured.');
  return clientId;
}

export async function cognitoApi(operation, payload) {
  const response = await fetch(`https://cognito-idp.${getCognitoRegion()}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const rawType = result.__type || result.code || response.headers.get('x-amzn-errortype') || 'CognitoServiceException';
    const error = new Error(result.message || 'A autenticação não pôde ser concluída.');
    error.name = String(rawType).split('#').at(-1).split(':')[0].split('.').at(-1);
    error.requestId = response.headers.get('x-amzn-requestid') || response.headers.get('x-amz-cf-id') || '';
    throw error;
  }
  return result;
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  };
}

export function setAuthCookies(response, authenticationResult) {
  if (!authenticationResult?.AccessToken || !authenticationResult?.RefreshToken) return false;
  response.cookies.set(ACCESS_COOKIE, authenticationResult.AccessToken, cookieOptions(
    authenticationResult.ExpiresIn || ACCESS_TOKEN_FALLBACK_SECONDS,
  ));
  response.cookies.set(REFRESH_COOKIE, authenticationResult.RefreshToken, cookieOptions(REFRESH_TOKEN_SECONDS));
  clearChallengeCookies(response);
  return true;
}

export function setPasswordChallengeCookies(response, { session, username }) {
  if (!session || !username) return false;
  response.cookies.set(CHALLENGE_SESSION_COOKIE, session, cookieOptions(5 * 60));
  response.cookies.set(CHALLENGE_USERNAME_COOKIE, username, cookieOptions(5 * 60));
  return true;
}

export function clearAuthCookies(response) {
  response.cookies.set(ACCESS_COOKIE, '', cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, '', cookieOptions(0));
  clearChallengeCookies(response);
}

export function clearChallengeCookies(response) {
  response.cookies.set(CHALLENGE_SESSION_COOKIE, '', cookieOptions(0));
  response.cookies.set(CHALLENGE_USERNAME_COOKIE, '', cookieOptions(0));
}

export function authErrorMessage(error) {
  switch (error?.name) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return 'E-mail ou senha inválidos.';
    case 'UserNotConfirmedException':
      return 'Este acesso ainda precisa ser confirmado. Fale com o suporte do RIFOU.';
    case 'PasswordResetRequiredException':
      return 'Sua senha precisa ser redefinida. Use a opção “Esqueci minha senha”.';
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      return 'O código está incorreto ou expirou. Solicite um novo código.';
    case 'InvalidPasswordException':
      return 'A senha não atende aos critérios de segurança.';
    case 'InvalidParameterException':
      return 'O Cognito rejeitou a configuração desta solicitação. Confira o App Client e o fluxo USER_PASSWORD_AUTH.';
    case 'ResourceNotFoundException':
      return 'O User Pool do Cognito não foi encontrado na região configurada.';
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return 'Muitas tentativas em sequência. Aguarde alguns minutos e tente novamente.';
    default:
      return 'Não foi possível concluir a solicitação agora. Tente novamente.';
  }
}

export function isCognitoAuthFailure(error) {
  return ['NotAuthorizedException', 'UserNotFoundException', 'PasswordResetRequiredException']
    .includes(error?.name);
}

export function isValidEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isStrongPassword(value) {
  return typeof value === 'string'
    && value.length >= 12
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

export function noStoreJson(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}
