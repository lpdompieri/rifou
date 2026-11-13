import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const rafflesTable = process.env.RAFFLES_TABLE;
const numbersTable = process.env.RAFFLE_NUMBERS_TABLE;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const PUBLIC_NUMBER_STATUSES = new Set(['AVAILABLE', 'RESERVED', 'CONFIRMED']);

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export const handler = async (event) => {
  if (!rafflesTable || !numbersTable) {
    console.error('Missing raffle table environment variables.');
    return json(500, { message: 'A API de rifas não está configurada.' });
  }

  const raffleId = event.pathParameters?.raffleId;
  if (typeof raffleId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raffleId)) {
    return json(400, { message: 'O identificador da rifa é inválido.' });
  }

  const query = event.queryStringParameters || {};
  const startNumber = parsePositiveInteger(query.from, 1);
  const requestedLimit = parsePositiveInteger(query.limit, DEFAULT_LIMIT);
  if (startNumber === null || requestedLimit === null) {
    return json(400, { message: 'Os parâmetros from e limit devem ser inteiros positivos.' });
  }
  const limit = Math.min(requestedLimit, MAX_LIMIT);

  try {
    const raffleResult = await dynamo.send(new GetCommand({
      TableName: rafflesTable,
      Key: { raffleId },
      ConsistentRead: true,
    }));
    const raffle = raffleResult.Item;
    if (!raffle || raffle.status !== 'ACTIVE') {
      return json(404, { message: 'Rifa não encontrada.' });
    }

    const totalNumbers = Number(raffle.numberCount);
    if (!Number.isSafeInteger(totalNumbers) || totalNumbers < 1) {
      console.error('Invalid numberCount on public raffle.', { raffleId });
      return json(500, { message: 'A disponibilidade desta rifa está temporariamente indisponível.' });
    }
    if (startNumber > totalNumbers) {
      return json(400, { message: 'O parâmetro from excede o total de números da rifa.' });
    }

    const endNumber = Math.min(startNumber + limit - 1, totalNumbers);
    const result = await dynamo.send(new QueryCommand({
      TableName: numbersTable,
      KeyConditionExpression: '#raffleId = :raffleId AND #number BETWEEN :start AND :end',
      ExpressionAttributeNames: { '#raffleId': 'raffleId', '#number': 'number' },
      ExpressionAttributeValues: {
        ':raffleId': raffleId,
        ':start': startNumber,
        ':end': endNumber,
      },
      ConsistentRead: true,
      ScanIndexForward: true,
    }));
    const storedItems = new Map((result.Items || []).map((item) => {
      if (!PUBLIC_NUMBER_STATUSES.has(item.status)) {
        throw new Error('Invalid public number status.');
      }
      return [Number(item.number), item.status];
    }));
    // Number records are created lazily when first reserved; an absent row is available.
    const items = Array.from({ length: endNumber - startNumber + 1 }, (_, index) => {
      const number = startNumber + index;
      return { number, status: storedItems.get(number) || 'AVAILABLE' };
    });
    const reservedCount = Number(raffle.reservedCount || 0);
    const confirmedCount = Number(raffle.confirmedCount || 0);

    return json(200, {
      raffleId,
      totalNumbers,
      availableCount: Math.max(0, totalNumbers - reservedCount - confirmedCount),
      reservedCount,
      confirmedCount,
      items,
      nextFrom: endNumber < totalNumbers ? endNumber + 1 : null,
    });
  } catch (error) {
    console.error('Failed to query public raffle numbers.', {
      name: error?.name || 'UnknownError',
      requestId: event.requestContext?.requestId,
    });
    return json(500, { message: 'Não foi possível carregar a disponibilidade agora.' });
  }
};
