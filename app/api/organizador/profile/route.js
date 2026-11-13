import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  authErrorMessage,
  clearAuthCookies,
  cognitoApi,
  isCognitoAuthFailure,
  noStoreJson,
} from '../auth/shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatProfile(result) {
  const attributes = Object.fromEntries((result.UserAttributes || []).map(({ Name, Value }) => [Name, Value]));
  return {
    name: attributes.name || '',
    email: attributes.email || result.Username || '',
    emailVerified: attributes.email_verified === 'true',
    phone: attributes.phone_number || '',
    phoneVerified: attributes.phone_number_verified === 'true',
  };
}

async function getAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value || '';
}

async function authFailure(error) {
  console.error('RIFOU organizer profile request failed.', { name: error?.name || 'UnknownError' });
  if (isCognitoAuthFailure(error)) {
    const response = noStoreJson({ authenticated: false, message: 'Sua sessão expirou. Entre novamente.' }, 401);
    clearAuthCookies(response);
    return response;
  }
  return noStoreJson({ message: authErrorMessage(error) }, 503);
}

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  return null;
}

export async function GET() {
  const accessToken = await getAccessToken();
  if (!accessToken) return noStoreJson({ authenticated: false }, 401);
  try {
    const result = await cognitoApi('GetUser', { AccessToken: accessToken });
    return noStoreJson({ profile: formatProfile(result) });
  } catch (error) {
    return authFailure(error);
  }
}

export async function PATCH(request) {
  const accessToken = await getAccessToken();
  if (!accessToken) return noStoreJson({ authenticated: false }, 401);
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return noStoreJson({ message: 'Informe os dados do perfil em JSON.' }, 400);
  }

  let requestedName;
  if (Object.hasOwn(payload, 'name')) {
    const name = typeof payload.name === 'string' ? payload.name.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 2 || name.length > 120) return noStoreJson({ message: 'Informe um nome entre 2 e 120 caracteres.' }, 400);
    requestedName = name;
  }
  let requestedPhone;
  if (Object.hasOwn(payload, 'phone')) {
    const phone = normalizePhone(payload.phone);
    if (phone === null) return noStoreJson({ message: 'Informe um telefone válido com DDD.' }, 400);
    requestedPhone = phone;
  }
  if (requestedName === undefined && requestedPhone === undefined) {
    return noStoreJson({ message: 'Nenhuma alteração de perfil válida foi enviada.' }, 400);
  }

  try {
    const current = await cognitoApi('GetUser', { AccessToken: accessToken });
    const currentAttributes = Object.fromEntries((current.UserAttributes || []).map(({ Name, Value }) => [Name, Value]));
    const attributes = [];
    if (requestedName !== undefined && requestedName !== currentAttributes.name) {
      attributes.push({ Name: 'name', Value: requestedName });
    }
    const phoneChanged = Boolean(requestedPhone && requestedPhone !== currentAttributes.phone_number);
    if (phoneChanged) attributes.push({ Name: 'phone_number', Value: requestedPhone });
    if (!attributes.length) return noStoreJson({ profile: formatProfile(current), phoneVerificationRequired: false });

    const updateResult = await cognitoApi('UpdateUserAttributes', { AccessToken: accessToken, UserAttributes: attributes });
    const profileResult = await cognitoApi('GetUser', { AccessToken: accessToken });
    const phoneDelivery = (updateResult.CodeDeliveryDetailsList || []).find((item) => item.AttributeName === 'phone_number');
    return noStoreJson({
      profile: formatProfile(profileResult),
      phoneVerificationRequired: Boolean(phoneChanged && phoneDelivery),
      phoneVerificationDelivery: phoneDelivery ? {
        medium: phoneDelivery.DeliveryMedium,
        destination: phoneDelivery.Destination,
      } : null,
    });
  } catch (error) {
    return authFailure(error);
  }
}
