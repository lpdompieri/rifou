import { createHmac, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const rafflesTable = process.env.RAFFLES_TABLE;
const numbersTable = process.env.RAFFLE_NUMBERS_TABLE;
const transactionsTable = process.env.RAFFLE_TRANSACTIONS_TABLE;
const participantLimitsTable = process.env.PARTICIPANT_LIMITS_TABLE;
const participantLimitHashSecretArn = process.env.PARTICIPANT_LIMIT_HASH_SECRET_ARN;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsManager = new SecretsManagerClient({});
const RESERVATION_DURATION_MS = 15 * 60 * 1000;
// 97 picks + order + participant counter + raffle counter = 100 transaction actions.
const MAX_NUMBERS_PER_ORDER = 97;
let participantLimitHashSecretPromise;

async function getParticipantId(phone) {
  participantLimitHashSecretPromise ||= secretsManager.send(new GetSecretValueCommand({
    SecretId: participantLimitHashSecretArn,
  })).then((result) => {
    if (typeof result.SecretString !== 'string' || result.SecretString.length < 32) {
      throw new Error('Participant limit HMAC secret is missing or invalid.');
    }
    return result.SecretString;
  }).catch((error) => {
    participantLimitHashSecretPromise = undefined;
    throw error;
  });
  const secret = await participantLimitHashSecretPromise;
  return createHmac('sha256', secret).update(phone, 'utf8').digest('hex');
}

function purchaseLimitError({ maxNumbersPerUser, alreadyCounted, requested }) {
  const remaining = Math.max(0, maxNumbersPerUser - alreadyCounted);
  return json(409, {
    code: 'USER_LIMIT_REACHED',
    maxNumbersPerUser,
    alreadyCounted,
    remaining,
    message: remaining === 0
      ? `Este telefone já atingiu o limite de ${maxNumbersPerUser} números nesta rifa.`
      : `Este telefone já possui ${alreadyCounted} número(s) nesta rifa e pode reservar mais ${remaining}. Você selecionou ${requested}.`,
  });
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

function readBody(event) {
  if (typeof event.body !== 'string' || !event.body) return null;
  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function normalizeCustomer(customer) {
  const name = typeof customer?.name === 'string'
    ? customer.name.trim().replace(/\s+/g, ' ')
    : '';
  let phoneDigits = typeof customer?.phone === 'string'
    ? customer.phone.replace(/\D/g, '')
    : '';

  if (phoneDigits.startsWith('55') && (phoneDigits.length === 12 || phoneDigits.length === 13)) {
    phoneDigits = phoneDigits.slice(2);
  }
  if (name.length < 3 || name.length > 120 || (phoneDigits.length !== 10 && phoneDigits.length !== 11)) {
    return null;
  }

  return { name, phone: `+55${phoneDigits}` };
}

export const handler = async (event) => {
  if (!rafflesTable || !numbersTable || !transactionsTable || !participantLimitsTable || !participantLimitHashSecretArn) {
    console.error('Missing table environment variables for Pix order creation.');
    return json(500, { message: 'A geração de Pix não está configurada.' });
  }

  const raffleId = event.pathParameters?.raffleId;
  if (typeof raffleId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raffleId)) {
    return json(400, { message: 'O identificador da rifa é inválido.' });
  }

  const payload = readBody(event);
  const customer = normalizeCustomer(payload?.customer);
  if (!customer) {
    return json(400, { message: 'Informe um nome válido e um WhatsApp com DDD.' });
  }

  const requestedNumbers = payload?.numbers;
  if (!Array.isArray(requestedNumbers) || requestedNumbers.length < 1
    || requestedNumbers.length > MAX_NUMBERS_PER_ORDER
    || requestedNumbers.some((number) => !Number.isSafeInteger(number) || number < 1)
    || new Set(requestedNumbers).size !== requestedNumbers.length) {
    return json(400, {
      message: `Selecione entre 1 e ${MAX_NUMBERS_PER_ORDER} números diferentes para continuar.`,
    });
  }
  const numbers = [...requestedNumbers].sort((first, second) => first - second);

  try {
    const raffleResult = await dynamo.send(new GetCommand({
      TableName: rafflesTable,
      Key: { raffleId },
      ConsistentRead: true,
    }));
    const raffle = raffleResult.Item;
    if (!raffle || raffle.status !== 'ACTIVE') {
      return json(404, { message: 'Rifa não encontrada ou indisponível.' });
    }

    const totalNumbers = Number(raffle.numberCount);
    const unitPriceInCents = Number(raffle.priceInCents);
    const maxNumbersPerUser = Number(raffle.maxNumbersPerUser ?? Math.min(MAX_NUMBERS_PER_ORDER, totalNumbers));
    if (!Number.isSafeInteger(totalNumbers) || totalNumbers < 1
      || !Number.isSafeInteger(unitPriceInCents) || unitPriceInCents < 1
      || !Number.isSafeInteger(maxNumbersPerUser) || maxNumbersPerUser < 1
      || maxNumbersPerUser > MAX_NUMBERS_PER_ORDER || maxNumbersPerUser > totalNumbers) {
      console.error('Raffle has invalid pricing or number count.', { raffleId });
      return json(500, { message: 'Esta rifa está temporariamente indisponível para participação.' });
    }
    if (numbers.some((number) => number > totalNumbers)) {
      return json(400, { message: 'Um ou mais números não pertencem a esta rifa.' });
    }

    const participantId = await getParticipantId(customer.phone);
    const participantKey = { raffleId, participantId };
    const participantResult = await dynamo.send(new GetCommand({
      TableName: participantLimitsTable,
      Key: participantKey,
      ConsistentRead: true,
    }));
    const alreadyCounted = Number(participantResult.Item?.activeNumbers || 0);
    if (!Number.isSafeInteger(alreadyCounted) || alreadyCounted < 0) {
      console.error('Raffle participant counter is invalid.', { raffleId });
      return json(500, { message: 'O limite de participação está temporariamente indisponível.' });
    }
    if (numbers.length > maxNumbersPerUser - alreadyCounted) {
      return purchaseLimitError({ maxNumbersPerUser, alreadyCounted, requested: numbers.length });
    }

    const amountInCents = unitPriceInCents * numbers.length;
    if (!Number.isSafeInteger(amountInCents)) {
      return json(400, { message: 'O valor desta participação excede o limite permitido.' });
    }

    const createdAtEpoch = Math.floor(Date.now() / 1000);
    const expiresAt = Date.now() + RESERVATION_DURATION_MS;
    const expiresAtEpoch = Math.ceil(expiresAt / 1000);
    const transactionId = randomUUID();
    const createdAt = new Date(createdAtEpoch * 1000).toISOString();
    const order = {
      transactionId,
      raffleId,
      participantId,
      participantCountTracked: true,
      raffleTitle: raffle.title,
      createdAt,
      createdAtEpoch,
      customer,
      numbers,
      quantity: numbers.length,
      unitPriceInCents,
      amountInCents,
      status: 'PENDING',
      pendingStatus: 'PENDING',
      expiresAt: new Date(expiresAt).toISOString(),
      expiresAtEpoch,
      isDemo: true,
    };
    const copyPasteCode = `RIFOU-DEMO|PEDIDO:${transactionId}|RIFA:${raffleId}|NUMEROS:${numbers.join('-')}|VALOR:${(amountInCents / 100).toFixed(2)}`;
    const now = new Date().toISOString();

    const numberUpdates = numbers.map((number) => ({
      Update: {
        TableName: numbersTable,
        Key: { raffleId, number },
        UpdateExpression: 'SET #status = :reserved, reservationId = :transactionId, reservedUntil = :expiresAt, reservedUntilEpoch = :expiresAtEpoch',
        ConditionExpression: 'attribute_not_exists(#status) OR #status = :available',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':reserved': 'RESERVED',
          ':available': 'AVAILABLE',
          ':transactionId': transactionId,
          ':expiresAt': order.expiresAt,
          ':expiresAtEpoch': expiresAtEpoch,
        },
      },
    }));

    const participantLimitUpdate = {
      Update: {
        TableName: participantLimitsTable,
        Key: participantKey,
        UpdateExpression: 'SET #activeNumbers = if_not_exists(#activeNumbers, :zero) + :quantity',
        ConditionExpression: 'attribute_not_exists(#activeNumbers) OR #activeNumbers <= :maximumBeforeOrder',
        ExpressionAttributeNames: { '#activeNumbers': 'activeNumbers' },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':quantity': numbers.length,
          ':maximumBeforeOrder': maxNumbersPerUser - numbers.length,
        },
      },
    };

    await dynamo.send(new TransactWriteCommand({
      ClientRequestToken: transactionId,
      TransactItems: [
        {
          Put: {
            TableName: transactionsTable,
            Item: order,
            ConditionExpression: 'attribute_not_exists(transactionId)',
          },
        },
        ...numberUpdates,
        participantLimitUpdate,
        {
          Update: {
            TableName: rafflesTable,
            Key: { raffleId },
            UpdateExpression: 'SET #financialsLocked = :locked, #historyChecked = :checked ADD reservedCount :quantity',
            ConditionExpression: '#status = :active AND #numberCount = :totalNumbers AND #price = :unitPrice AND (attribute_not_exists(#maxPerUser) OR #maxPerUser = :maxPerUser)',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#numberCount': 'numberCount',
              '#price': 'priceInCents',
              '#maxPerUser': 'maxNumbersPerUser',
              '#financialsLocked': 'financialsLocked',
              '#historyChecked': 'financialsHistoryChecked',
            },
            ExpressionAttributeValues: {
              ':quantity': numbers.length,
              ':locked': true,
              ':checked': true,
              ':active': 'ACTIVE',
              ':totalNumbers': totalNumbers,
              ':unitPrice': unitPriceInCents,
              ':maxPerUser': maxNumbersPerUser,
            },
          },
        },
      ],
    }));

    console.info('Created fake Pix order and reserved raffle numbers.', {
      transactionId,
      raffleId,
      quantity: numbers.length,
      createdAt: now,
      requestId: event.requestContext?.requestId,
    });

    return json(201, {
      item: {
        transactionId,
        raffleId,
        numbers,
        quantity: numbers.length,
        unitPriceInCents,
        amountInCents,
        status: 'PENDING',
        expiresAt,
        copyPasteCode,
        isDemo: true,
      },
    });
  } catch (error) {
    if (error?.name === 'TransactionCanceledException' || error?.name === 'TransactionConflictException') {
      try {
        const currentParticipant = await dynamo.send(new GetCommand({
          TableName: participantLimitsTable,
          Key: participantKey,
          ConsistentRead: true,
        }));
        const countNow = Number(currentParticipant.Item?.activeNumbers || 0);
        if (Number.isSafeInteger(countNow) && countNow >= 0 && numbers.length > maxNumbersPerUser - countNow) {
          return purchaseLimitError({ maxNumbersPerUser, alreadyCounted: countNow, requested: numbers.length });
        }
      } catch (readError) {
        console.error('Could not read participant limit after a cancelled Pix transaction.', {
          name: readError?.name || 'UnknownError',
          requestId: event.requestContext?.requestId,
        });
      }
      return json(409, { message: 'A rifa ou a disponibilidade dos números mudou. Confira os números e tente novamente.' });
    }
    console.error('Failed to create fake Pix order.', {
      name: error?.name || 'UnknownError',
      message: error?.message,
      requestId: event.requestContext?.requestId,
    });
    return json(500, { message: 'Não foi possível gerar o Pix demonstrativo agora.' });
  }
};
