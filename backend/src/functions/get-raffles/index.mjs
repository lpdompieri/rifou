import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const tableName = process.env.RAFFLES_TABLE;
const publicIndex = process.env.PUBLIC_RAFFLES_INDEX || 'PublicRafflesIndex';
const featuredIndex = process.env.FEATURED_RAFFLES_INDEX || 'FeaturedRafflesIndex';
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 50;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

function parseNextToken(token, partitionKey, status) {
  if (!token) return undefined;

  try {
    const key = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (
      !key
      || typeof key !== 'object'
      || Array.isArray(key)
      || typeof key.raffleId !== 'string'
      || key[partitionKey] !== status
      || !Number.isInteger(key.sortOrder)
    ) {
      throw new Error('Invalid token');
    }
    return key;
  } catch {
    throw new Error('O parâmetro nextToken é inválido.');
  }
}

function formatPrice(priceInCents) {
  const value = Number(priceInCents);
  if (!Number.isFinite(value)) return '0,00';

  return (value / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoneyInCents(value) {
  return (Number(value) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDrawingDate(value, style) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'A definir';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) return 'A definir';
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  if (style === 'long') {
    const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(date);
    return `${day} de ${month} de ${year}`;
  }
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date);
  return `${day} ${month}, ${year}`;
}

function toPublicRaffle(item) {
  const numberCount = Number(item.numberCount || 0);
  const calculatedPrizeInCents = Number(item.priceInCents) * numberCount;
  const maxNumbersPerUser = Number(item.maxNumbersPerUser || Math.min(97, numberCount || 97));
  const reserved = Number(item.reservedCount || 0);
  const confirmed = Number(item.confirmedCount || 0);
  const sold = numberCount > 0
    ? Math.min(100, Math.round(((reserved + confirmed) / numberCount) * 100))
    : Number(item.soldPercent || 0);

  const result = {
    id: item.raffleId,
    image: item.image,
    imageAlt: item.imageAlt,
    organizer: item.organizer,
    title: item.title,
    description: item.description,
    prizeValue: Number.isSafeInteger(calculatedPrizeInCents) && calculatedPrizeInCents > 0
      ? formatMoneyInCents(calculatedPrizeInCents)
      : item.prizeValue || '0,00',
    price: formatPrice(item.priceInCents),
    numbers: String(numberCount),
    maxNumbersPerUser,
    drawingDate: formatDrawingDate(item.drawingDate, 'short'),
    drawingDateLong: item.drawingDateLong || formatDrawingDate(item.drawingDate, 'long'),
    sold,
    cardSold: Number(item.cardSoldPercent ?? sold),
    reserved,
    confirmed,
    status: item.status,
    featured: Boolean(item.featured),
  };
  if (item.status === 'DRAWN' && item.drawResult) {
    result.drawResult = {
      number: Number(item.drawResult.number),
      winnerName: typeof item.drawResult.winnerName === 'string' ? item.drawResult.winnerName : 'Participante',
      drawnAt: typeof item.drawResult.drawnAt === 'string' ? item.drawResult.drawnAt : '',
    };
  }
  return result;
}

export const handler = async (event) => {
  if (!tableName) {
    console.error('Missing RAFFLES_TABLE environment variable.');
    return json(500, { message: 'A API de rifas não está configurada.' });
  }

  const query = event.queryStringParameters || {};
  const status = String(query.status || 'ACTIVE').trim().toUpperCase();
  if (!['ACTIVE', 'DRAWN'].includes(status)) {
    return json(400, { message: 'Esta rota pública aceita status=ACTIVE ou status=DRAWN.' });
  }

  let featured;
  if (query.featured !== undefined) {
    const normalizedFeatured = String(query.featured).trim().toLowerCase();
    if (normalizedFeatured !== 'true' && normalizedFeatured !== 'false') {
      return json(400, { message: 'O parâmetro featured deve ser true ou false.' });
    }
    featured = normalizedFeatured === 'true';
  }

  const requestedLimit = Number.parseInt(query.limit || String(DEFAULT_LIMIT), 10);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return json(400, { message: 'O parâmetro limit deve ser um inteiro positivo.' });
  }
  const limit = Math.min(requestedLimit, MAX_LIMIT);

  const useFeaturedIndex = featured === true;
  if (useFeaturedIndex && status !== 'ACTIVE') {
    return json(400, { message: 'Somente rifas ativas podem ser consultadas como destaque.' });
  }
  const partitionKey = useFeaturedIndex ? 'featuredStatus' : 'publicStatus';
  const indexName = useFeaturedIndex ? featuredIndex : publicIndex;
  let exclusiveStartKey;
  try {
    exclusiveStartKey = parseNextToken(query.nextToken, partitionKey, status);
  } catch (error) {
    return json(400, { message: error.message });
  }

  const expressionAttributeNames = { '#status': partitionKey };
  const expressionAttributeValues = { ':active': status };

  const commandInput = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: '#status = :active',
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ScanIndexForward: status === 'ACTIVE',
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  };

  if (featured === false) {
    expressionAttributeNames['#featured'] = 'featured';
    expressionAttributeValues[':featured'] = false;
    commandInput.FilterExpression = '#featured = :featured';
  }

  try {
    const result = await dynamo.send(new QueryCommand(commandInput));
    const items = (result.Items || []).map(toPublicRaffle);
    const nextToken = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
      : null;

    return json(200, { items, count: items.length, nextToken });
  } catch (error) {
    console.error('Failed to query public raffles.', {
      name: error?.name || 'UnknownError',
      requestId: event.requestContext?.requestId,
    });
    return json(500, { message: 'Não foi possível carregar as rifas agora.' });
  }
};
