import {
  authErrorMessage,
  cognitoApi,
  getCognitoClientId,
  isValidEmail,
  noStoreJson,
} from '../shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return noStoreJson({ message: 'Informe um e-mail válido.' }, 400);

  try {
    await cognitoApi('ForgotPassword', {
      ClientId: getCognitoClientId(),
      Username: email,
    });
  } catch (error) {
    if (!['UserNotFoundException', 'InvalidParameterException'].includes(error?.name)) {
      console.error('RIFOU organizer recovery request failed.', { name: error?.name || 'UnknownError' });
      const status = error?.name === 'TooManyRequestsException' || error?.name === 'LimitExceededException' ? 429 : 503;
      return noStoreJson({ message: authErrorMessage(error) }, status);
    }
  }

  return noStoreJson({
    message: 'Se este e-mail estiver cadastrado, enviaremos um código de recuperação.',
  });
}
