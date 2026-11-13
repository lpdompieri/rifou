import {
  authErrorMessage,
  cognitoApi,
  getCognitoClientId,
  isStrongPassword,
  isValidEmail,
  noStoreJson,
} from '../shared.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const email = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const confirmationCode = typeof payload?.confirmationCode === 'string' ? payload.confirmationCode.trim() : '';
  const newPassword = typeof payload?.newPassword === 'string' ? payload.newPassword : '';
  if (!isValidEmail(email) || !confirmationCode || confirmationCode.length > 32 || !isStrongPassword(newPassword)) {
    return noStoreJson({ message: 'Confira o e-mail, o código e os critérios da nova senha.' }, 400);
  }

  try {
    await cognitoApi('ConfirmForgotPassword', {
      ClientId: getCognitoClientId(),
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword,
    });
    return noStoreJson({ message: 'Senha atualizada. Entre com sua nova senha.' });
  } catch (error) {
    console.error('RIFOU organizer password confirmation failed.', { name: error?.name || 'UnknownError' });
    const status = ['CodeMismatchException', 'ExpiredCodeException', 'InvalidPasswordException'].includes(error?.name) ? 400
      : error?.name === 'TooManyRequestsException' || error?.name === 'LimitExceededException' ? 429 : 503;
    return noStoreJson({ message: authErrorMessage(error) }, status);
  }
}
