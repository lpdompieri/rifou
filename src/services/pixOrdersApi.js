export async function createPixOrder({ raffleId, name, phone, numbers }) {
  const response = await fetch(`/api/raffles/${encodeURIComponent(raffleId)}/pix-orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      customer: { name, phone },
      numbers,
    }),
  });
  const responseBody = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(responseBody);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.message || 'Não foi possível gerar o Pix demonstrativo.');
    error.status = response.status;
    error.code = payload.code;
    error.maxNumbersPerUser = payload.maxNumbersPerUser;
    error.remaining = payload.remaining;
    throw error;
  }

  if (!payload.item?.transactionId || !Array.isArray(payload.item.numbers)
    || typeof payload.item.copyPasteCode !== 'string' || !Number.isFinite(payload.item.expiresAt)
    || !Number.isSafeInteger(payload.item.amountInCents) || payload.item.amountInCents < 1) {
    throw new Error('A resposta da API de Pix está inválida.');
  }

  return {
    id: payload.item.transactionId,
    raffleId: payload.item.raffleId,
    numbers: payload.item.numbers,
    amountInCents: payload.item.amountInCents,
    expiresAt: payload.item.expiresAt,
    copyPasteCode: payload.item.copyPasteCode,
    isDemo: true,
  };
}
