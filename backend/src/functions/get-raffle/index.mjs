import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const tableName = process.env.RAFFLES_TABLE;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(statusCode, payload) {
  const result = {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
  return result;
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

  const raffleId = event.pathParameters?.raffleId;
  if (typeof raffleId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raffleId)) {
    return json(400, { message: 'O identificador da rifa é inválido.' });
  }

  try {
    const result = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { raffleId },
      ConsistentRead: true,
    }));
    const isPublic = result.Item?.status === 'ACTIVE'
      || (result.Item?.status === 'DRAWN' && result.Item?.publicStatus === 'DRAWN' && result.Item?.drawResult);
    if (!isPublic) {
      return json(404, { message: 'Rifa não encontrada.' });
    }
    return json(200, { item: toPublicRaffle(result.Item) });
  } catch (error) {
    console.error('Failed to get public raffle.', {
      name: error?.name || 'UnknownError',
      requestId: event.requestContext?.requestId,
    });
    return json(500, { message: 'Não foi possível carregar esta rifa agora.' });
  }
};
