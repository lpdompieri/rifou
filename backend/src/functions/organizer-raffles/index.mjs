import { randomInt, randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { DynamoDBDocumentClient, GetCommand, BatchGetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const tableName = process.env.RAFFLES_TABLE;
const appConfigTable = process.env.APP_CONFIG_TABLE;
const ownerIndex = process.env.ORGANIZER_RAFFLES_INDEX || 'OrganizerRafflesByOwnerIndex';
const featuredIndex = process.env.FEATURED_RAFFLES_INDEX || 'FeaturedRafflesIndex';
const transactionsTable = process.env.RAFFLE_TRANSACTIONS_TABLE;
const transactionsIndex = process.env.RAFFLE_TRANSACTIONS_INDEX || 'RaffleTransactionsByCreatedAtIndex';
const raffleNumbersTable = process.env.RAFFLE_NUMBERS_TABLE;
const auditEventsTable = process.env.AUDIT_EVENTS_TABLE;
const organizerSupportTicketsTable = process.env.ORGANIZER_SUPPORT_TICKETS_TABLE;
const organizerAuditIndex = 'OrganizerAuditEventsIndex';
const raffleAuditIndex = 'RaffleAuditEventsIndex';
const supportTicketsIndex = 'OrganizerSupportTicketsIndex';
const imagesBucket = process.env.RAFFLE_IMAGES_BUCKET;
const imagesPublicBaseUrl = process.env.RAFFLE_IMAGES_PUBLIC_BASE_URL;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const MAX_PAGE_SIZE = 100;
const MAX_RAFFLE_NUMBERS = 1_000_000;
const MAX_NUMBERS_PER_USER = 97;
const DEFAULT_TRANSACTION_PAGE_SIZE = 30;
const DEFAULT_AUDIT_PAGE_SIZE = 50;
const MAX_AUDIT_PAGE_SIZE = 100;
const MAX_SUPPORT_TICKET_PAGE_SIZE = 50;
const MAX_RAFFLE_IMAGE_BYTES = 5 * 1024 * 1024;
const HOME_FEATURED_CONFIG_KEY = 'HOME_FEATURED_RAFFLE';
const DEFAULT_COMPLETION_DELAY_DAYS = 30;
const MIN_COMPLETION_DELAY_DAYS = 1;
const MAX_COMPLETION_DELAY_DAYS = 365;
const RAFFLE_IMAGE_TYPES = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(payload),
  };
}

function readBody(event) {
  if (typeof event.body !== 'string' || !event.body) return null;
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
  } catch {
    return null;
  }
}

function emailFromClaims(claims) {
  const candidates = [claims.email, claims.username, claims['cognito:username']];
  return candidates.find((value) => typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || '';
}

function ownerFrom(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const sub = claims?.sub;
  if (typeof sub !== 'string' || !sub) return null;
  const email = emailFromClaims(claims);
  return {
    sub,
    label: typeof claims.name === 'string' && claims.name
      ? claims.name
      : typeof claims.email === 'string' && claims.email
      ? claims.email
      : typeof claims.username === 'string' && claims.username ? claims.username : 'Organizador',
    email,
  };
}

function auditPut(owner, { action, raffleId, raffleTitle, details = {}, occurredAt = new Date().toISOString() }) {
  if (!auditEventsTable) throw new Error('Missing AUDIT_EVENTS_TABLE configuration.');
  const item = {
    auditId: randomUUID(),
    organizerSub: owner.sub,
    actor: owner.email || owner.label,
    ...(owner.email ? { actorEmail: owner.email } : {}),
    action,
    occurredAt,
    ...(raffleId ? { raffleId } : {}),
    ...(raffleTitle ? { raffleTitle } : {}),
    details,
  };
  return {
    Put: {
      TableName: auditEventsTable,
      Item: item,
      ConditionExpression: 'attribute_not_exists(auditId)',
    },
  };
}

function normalizeText(value, { min = 0, max = 2000 } = {}) {
  if (typeof value !== 'string') return null;
  const result = value.trim().replace(/\s+/g, ' ');
  return result.length >= min && result.length <= max ? result : null;
}

function normalizePrice(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 100_000_000) return null;
  return number;
}

function formatMoneyInCents(value) {
  return (Number(value) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseLegacyPrizeValue(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[^\d,.-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const amount = Number(normalized);
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function normalizeNumberCount(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 10 || number > MAX_RAFFLE_NUMBERS) return null;
  return number;
}

function normalizeMaxNumbersPerUser(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > MAX_NUMBERS_PER_USER) return null;
  return number;
}

function normalizeStatus(value, fallback = 'DRAFT') {
  const status = value === undefined ? fallback : value;
  return ['DRAFT', 'ACTIVE', 'INACTIVE', 'DRAWN'].includes(status) ? status : null;
}

function normalizeDate(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function normalizeImage(value) {
  const image = normalizeText(value, { max: 1000 });
  if (image === null || image === '') return '';
  if (image.startsWith('/') && !image.startsWith('//')) return image;
  try {
    const url = new URL(image);
    return ['https:', 'http:'].includes(url.protocol) ? image : null;
  } catch {
    return null;
  }
}

function isManagedRaffleImage(value) {
  if (!imagesPublicBaseUrl || typeof value !== 'string') return false;
  try {
    const base = new URL(imagesPublicBaseUrl);
    const image = new URL(value);
    return base.protocol === 'https:'
      && image.protocol === 'https:'
      && image.origin === base.origin
      && !image.search
      && !image.hash
      && /^\/raffle-images\/[0-9a-f-]{36}\.(avif|jpg|png|webp)$/i.test(image.pathname);
  } catch {
    return false;
  }
}

function toOwnedRaffle(item) {
  const numberCount = Number(item.numberCount || 0);
  const calculatedPrizeInCents = Number(item.priceInCents) * numberCount;
  const storedPrizeInCents = Number.isSafeInteger(Number(item.prizeValueInCents))
    ? Number(item.prizeValueInCents)
    : parseLegacyPrizeValue(item.prizeValue);
  const prizeValueInCents = Number.isSafeInteger(calculatedPrizeInCents) && calculatedPrizeInCents > 0
    ? calculatedPrizeInCents
    : storedPrizeInCents;
  const maxNumbersPerUser = Number(item.maxNumbersPerUser || Math.min(MAX_NUMBERS_PER_USER, numberCount || MAX_NUMBERS_PER_USER));
  const reservedCount = Number(item.reservedCount || 0);
  const confirmedCount = Number(item.confirmedCount || 0);
  const sold = numberCount > 0
    ? Math.min(100, Math.round(((reservedCount + confirmedCount) / numberCount) * 100))
    : 0;
  return {
    id: item.raffleId,
    title: item.title,
    organizer: item.organizer || 'Organizador',
    description: item.description || '',
    prizeValue: prizeValueInCents ? formatMoneyInCents(prizeValueInCents) : item.prizeValue || '',
    prizeValueInCents,
    image: item.image || '',
    imageAlt: item.imageAlt || item.title,
    priceInCents: Number(item.priceInCents || 0),
    price: (Number(item.priceInCents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    numberCount,
    maxNumbersPerUser,
    numbers: String(numberCount),
    drawingDate: item.drawingDate || '',
    sortOrder: Number(item.sortOrder || 0),
    reserved: reservedCount,
    confirmed: confirmedCount,
    sold,
    financialsLocked: item.financialsLocked === true || reservedCount > 0 || confirmedCount > 0,
    status: item.status || 'DRAFT',
    featured: Boolean(item.featured),
    drawResult: item.drawResult && Number.isSafeInteger(Number(item.drawResult.number))
      ? {
        number: Number(item.drawResult.number),
        winnerName: typeof item.drawResult.winnerName === 'string' ? item.drawResult.winnerName : 'Participante',
        drawnAt: typeof item.drawResult.drawnAt === 'string' ? item.drawResult.drawnAt : '',
      }
      : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function encodeKey(key) {
  return key ? Buffer.from(JSON.stringify(key)).toString('base64url') : null;
}

function decodeKey(token, ownerSub) {
  if (!token) return undefined;
  try {
    const key = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (key?.organizerSub !== ownerSub || typeof key.raffleId !== 'string' || typeof key.createdAt !== 'string') {
      throw new Error('Invalid key');
    }
    return key;
  } catch {
    throw new Error('O parâmetro nextToken é inválido.');
  }
}

function decodeTransactionKey(token, raffleId) {
  if (!token) return undefined;
  try {
    const key = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (key?.raffleId !== raffleId || !Number.isSafeInteger(key.createdAtEpoch) || typeof key.transactionId !== 'string') {
      throw new Error('Invalid key');
    }
    return key;
  } catch {
    throw new Error('O parâmetro nextToken é inválido.');
  }
}

function decodeAuditKey(token, ownerSub, raffleId) {
  if (!token) return undefined;
  try {
    const key = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if ((!raffleId && key?.organizerSub !== ownerSub) || typeof key?.auditId !== 'string'
      || typeof key.occurredAt !== 'string' || (raffleId && key.raffleId !== raffleId)) throw new Error('Invalid audit key');
    return key;
  } catch {
    throw new Error('O parâmetro nextToken é inválido.');
  }
}

function decodeSupportKey(token, ownerSub) {
  if (!token) return undefined;
  try {
    const key = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (key?.organizerSub !== ownerSub || typeof key.ticketId !== 'string' || typeof key.createdAt !== 'string') {
      throw new Error('Invalid support key');
    }
    return key;
  } catch {
    throw new Error('O parâmetro nextToken é inválido.');
  }
}

function auditDateBound(value, endOfDay = false) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dateCheck = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(dateCheck.valueOf()) || dateCheck.toISOString().slice(0, 10) !== value) return null;
  const startOfSaoPauloDay = new Date(`${value}T00:00:00.000-03:00`);
  if (endOfDay) startOfSaoPauloDay.setTime(startOfSaoPauloDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  return startOfSaoPauloDay.toISOString();
}

const AUDIT_ACTIONS = new Set([
  'RAFFLE_CREATED',
  'RAFFLE_UPDATED',
  'RAFFLE_STATUS_CHANGED',
  'FEATURED_RAFFLE_CHANGED',
  'PAYMENT_CONFIRMED_MANUALLY',
  'RAFFLE_DRAWN',
  'RAFFLE_COMPLETED',
  'ORGANIZER_SETTINGS_UPDATED',
  'SUPPORT_TICKET_CREATED',
]);

async function listAuditEvents(event, owner) {
  if (!auditEventsTable) return json(500, { message: 'A auditoria ainda não está configurada.' });
  const query = event.queryStringParameters || {};
  const raffleId = query.raffleId || '';
  if (raffleId) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(raffleId)) return json(400, { message: 'O identificador da rifa é inválido.' });
    if (!await getOwnedRaffle(raffleId, owner.sub)) return json(404, { message: 'Rifa não encontrada.' });
  }
  const action = query.action || '';
  if (action && !AUDIT_ACTIONS.has(action)) return json(400, { message: 'O filtro de ação é inválido.' });
  const from = auditDateBound(query.from);
  const to = auditDateBound(query.to, true);
  if (from === null || to === null || (from && to && from > to)) {
    return json(400, { message: 'Informe um período válido para a auditoria.' });
  }
  const requestedLimit = query.limit === undefined ? DEFAULT_AUDIT_PAGE_SIZE : Number(query.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) return json(400, { message: 'O parâmetro limit deve ser um inteiro positivo.' });

  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeAuditKey(query.nextToken, owner.sub, raffleId || undefined);
  } catch (error) {
    return json(400, { message: error.message });
  }

  const keyName = raffleId ? '#raffleId' : '#organizerSub';
  const keyValue = raffleId ? raffleId : owner.sub;
  let keyCondition = `${keyName} = :partition`;
  const names = { [keyName]: raffleId ? 'raffleId' : 'organizerSub' };
  const values = { ':partition': keyValue };
  if (from || to) names['#occurredAt'] = 'occurredAt';
  if (from && to) {
    keyCondition += ' AND #occurredAt BETWEEN :from AND :to';
    values[':from'] = from;
    values[':to'] = to;
  } else if (from) {
    keyCondition += ' AND #occurredAt >= :from';
    values[':from'] = from;
  } else if (to) {
    keyCondition += ' AND #occurredAt <= :to';
    values[':to'] = to;
  }
  const result = await dynamo.send(new QueryCommand({
    TableName: auditEventsTable,
    IndexName: raffleId ? raffleAuditIndex : organizerAuditIndex,
    KeyConditionExpression: keyCondition,
    ...(action ? { FilterExpression: '#action = :action' } : {}),
    ExpressionAttributeNames: { ...names, ...(action ? { '#action': 'action' } : {}) },
    ExpressionAttributeValues: { ...values, ...(action ? { ':action': action } : {}) },
    ScanIndexForward: false,
    Limit: Math.min(MAX_AUDIT_PAGE_SIZE, requestedLimit),
    ExclusiveStartKey: exclusiveStartKey,
  }));
  const items = (result.Items || []).filter((item) => item.organizerSub === owner.sub).map((item) => ({
    auditId: item.auditId,
    organizerSub: item.organizerSub,
    actor: item.actor === 'Sistema' ? 'Sistema' : owner.email || item.actorEmail || item.actor || 'Organizador',
    action: item.action,
    raffleId: item.raffleId || '',
    raffleTitle: item.raffleTitle || '',
    occurredAt: item.occurredAt,
    details: item.details || {},
  }));
  return json(200, { items, count: items.length, nextToken: encodeKey(result.LastEvaluatedKey) });
}

async function listSupportTickets(event, ownerSub) {
  if (!organizerSupportTicketsTable) return json(500, { message: 'O suporte ainda não está configurado.' });
  const query = event.queryStringParameters || {};
  const requestedLimit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) return json(400, { message: 'O parâmetro limit deve ser um inteiro positivo.' });
  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeSupportKey(query.nextToken, ownerSub);
  } catch (error) {
    return json(400, { message: error.message });
  }
  const result = await dynamo.send(new QueryCommand({
    TableName: organizerSupportTicketsTable,
    IndexName: supportTicketsIndex,
    KeyConditionExpression: '#organizerSub = :organizerSub',
    ExpressionAttributeNames: { '#organizerSub': 'organizerSub' },
    ExpressionAttributeValues: { ':organizerSub': ownerSub },
    ScanIndexForward: false,
    Limit: Math.min(MAX_SUPPORT_TICKET_PAGE_SIZE, requestedLimit),
    ExclusiveStartKey: exclusiveStartKey,
  }));
  const items = (result.Items || []).filter((item) => item.organizerSub === ownerSub).map((item) => ({
    ticketId: item.ticketId,
    subject: item.subject,
    category: item.category,
    description: item.description,
    raffleId: item.raffleId || '',
    raffleTitle: item.raffleTitle || '',
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
  return json(200, { items, count: items.length, nextToken: encodeKey(result.LastEvaluatedKey) });
}

async function createSupportTicket(event, owner) {
  if (!organizerSupportTicketsTable || !auditEventsTable) return json(500, { message: 'O suporte ainda não está configurado.' });
  const payload = readBody(event);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json(400, { message: 'Informe os dados do chamado.' });
  const subject = normalizeText(payload.subject, { min: 5, max: 120 });
  const category = ['BUG', 'PAYMENT', 'RAFFLE', 'ACCOUNT', 'OTHER'].includes(payload.category) ? payload.category : null;
  const description = typeof payload.description === 'string'
    ? payload.description.trim().replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : '';
  if (!subject || !category || description.length < 15 || description.length > 4000
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(description)) {
    return json(400, { message: 'Informe assunto, categoria e descrição de 15 a 4.000 caracteres.' });
  }
  let raffle;
  if (payload.raffleId) {
    const raffleId = raffleIdFrom({ pathParameters: { raffleId: payload.raffleId } });
    if (!raffleId) return json(400, { message: 'O identificador da rifa é inválido.' });
    raffle = await getOwnedRaffle(raffleId, owner.sub);
    if (!raffle) return json(404, { message: 'Rifa não encontrada.' });
  }

  const ticketId = randomUUID();
  const now = new Date().toISOString();
  const item = {
    ticketId,
    organizerSub: owner.sub,
    organizerLabel: owner.label,
    organizerEmail: owner.email,
    subject,
    category,
    description,
    ...(raffle ? { raffleId: raffle.raffleId, raffleTitle: raffle.title } : {}),
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  };
  await dynamo.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: organizerSupportTicketsTable,
          Item: item,
          ConditionExpression: 'attribute_not_exists(ticketId)',
        },
      },
      auditPut(owner, {
        action: 'SUPPORT_TICKET_CREATED',
        raffleId: item.raffleId,
        raffleTitle: item.raffleTitle,
        occurredAt: now,
        details: { ticketId, category, subject },
      }),
    ],
  }));
  return json(201, {
    item: {
      ticketId,
      subject,
      category,
      description,
      raffleId: item.raffleId || '',
      raffleTitle: item.raffleTitle || '',
      status: item.status,
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function queryOwnedRaffles(ownerSub, { limit = MAX_PAGE_SIZE, nextToken } = {}) {
  const exclusiveStartKey = decodeKey(nextToken, ownerSub);
  return dynamo.send(new QueryCommand({
    TableName: tableName,
    IndexName: ownerIndex,
    KeyConditionExpression: '#owner = :owner',
    ExpressionAttributeNames: { '#owner': 'organizerSub' },
    ExpressionAttributeValues: { ':owner': ownerSub },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
  }));
}

async function ensureHistoricalFinancialLock(raffle, ownerSub) {
  const raffleId = raffle.raffleId;
  const alreadyLocked = raffle.financialsLocked === true
    || Number(raffle.reservedCount || 0) > 0
    || Number(raffle.confirmedCount || 0) > 0;
  if (alreadyLocked || raffle.financialsHistoryChecked === true) return raffle;

  let hasReservationHistory = false;
  if (transactionsTable) {
    const result = await dynamo.send(new QueryCommand({
      TableName: transactionsTable,
      IndexName: transactionsIndex,
      KeyConditionExpression: '#raffleId = :raffleId',
      ExpressionAttributeNames: { '#raffleId': 'raffleId' },
      ExpressionAttributeValues: { ':raffleId': raffleId },
      Limit: 1,
      Select: 'COUNT',
    }));
    hasReservationHistory = Number(result.Count || 0) > 0;
  }

  try {
    const result = await dynamo.send(new UpdateCommand({
      TableName: tableName,
      Key: { raffleId },
      UpdateExpression: hasReservationHistory
        ? 'SET #financialsLocked = :locked, #historyChecked = :checked'
        : 'SET #historyChecked = :checked',
      ConditionExpression: '#owner = :owner AND (attribute_not_exists(#historyChecked) OR #historyChecked = :unchecked)',
      ExpressionAttributeNames: {
        '#owner': 'organizerSub',
        '#financialsLocked': 'financialsLocked',
        '#historyChecked': 'financialsHistoryChecked',
      },
      ExpressionAttributeValues: {
        ':owner': ownerSub,
        ':checked': true,
        ':unchecked': false,
        ...(hasReservationHistory ? { ':locked': true } : {}),
      },
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes || { ...raffle, financialsHistoryChecked: true, ...(hasReservationHistory ? { financialsLocked: true } : {}) };
  } catch (error) {
    if (error?.name !== 'ConditionalCheckFailedException') throw error;
    const latest = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { raffleId },
      ConsistentRead: true,
    }));
    return latest.Item?.organizerSub === ownerSub ? latest.Item : raffle;
  }
}

async function queryOwnedRafflesConsistently(ownerSub) {
  const keys = [];
  let cursor;
  do {
    const result = await queryOwnedRaffles(ownerSub, { limit: MAX_PAGE_SIZE, nextToken: cursor });
    keys.push(...(result.Items || []).map((item) => ({ raffleId: item.raffleId })));
    cursor = encodeKey(result.LastEvaluatedKey);
  } while (cursor);

  const itemsById = new Map();
  for (let offset = 0; offset < keys.length; offset += 100) {
    let remainingKeys = keys.slice(offset, offset + 100);
    for (let attempt = 0; remainingKeys.length && attempt < 5; attempt += 1) {
      const result = await dynamo.send(new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: remainingKeys,
            ConsistentRead: true,
          },
        },
      }));
      for (const item of result.Responses?.[tableName] || []) {
        if (item.organizerSub === ownerSub) itemsById.set(item.raffleId, item);
      }
      remainingKeys = result.UnprocessedKeys?.[tableName]?.Keys || [];
      if (remainingKeys.length && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
      }
    }
    if (remainingKeys.length) throw new Error('Could not read all organizer raffle records.');
  }
  const items = keys.map(({ raffleId }) => itemsById.get(raffleId)).filter(Boolean);
  const hydrated = [];
  for (let offset = 0; offset < items.length; offset += 10) {
    hydrated.push(...await Promise.all(items.slice(offset, offset + 10)
      .map((item) => ensureHistoricalFinancialLock(item, ownerSub))));
  }
  return hydrated;
}

function validateCreate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const title = normalizeText(payload.title, { min: 4, max: 120 });
  const description = normalizeText(payload.description, { min: 4, max: 2000 });
  const image = normalizeImage(payload.image);
  const imageAlt = normalizeText(payload.imageAlt || title, { min: 1, max: 200 });
  const prizeValueInCents = normalizePrice(payload.prizeValueInCents);
  const priceInCents = normalizePrice(payload.priceInCents);
  const numberCount = normalizeNumberCount(payload.numberCount);
  const maxNumbersPerUser = normalizeMaxNumbersPerUser(payload.maxNumbersPerUser);
  const drawingDate = normalizeDate(payload.drawingDate);
  const status = normalizeStatus(payload.status);
  const totalValueInCents = priceInCents !== null && numberCount !== null
    ? priceInCents * numberCount
    : NaN;
  if (!title || !description || image === null || !isManagedRaffleImage(image) || !imageAlt
    || prizeValueInCents === null || !Number.isSafeInteger(totalValueInCents)
    || prizeValueInCents !== totalValueInCents
    || priceInCents === null || numberCount === null || maxNumbersPerUser === null
    || maxNumbersPerUser > numberCount || drawingDate === null || !['DRAFT', 'ACTIVE', 'INACTIVE'].includes(status)) return null;
  return {
    title,
    description,
    prizeValue: formatMoneyInCents(prizeValueInCents),
    prizeValueInCents,
    image,
    imageAlt,
    priceInCents,
    numberCount,
    maxNumbersPerUser,
    drawingDate,
    status,
  };
}

function validatePatch(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const fields = {};
  const checks = [
    ['title', (value) => normalizeText(value, { min: 4, max: 120 })],
    ['description', (value) => normalizeText(value, { min: 4, max: 2000 })],
    ['prizeValueInCents', normalizePrice],
    ['image', normalizeImage],
    ['imageAlt', (value) => normalizeText(value, { min: 1, max: 200 })],
    ['priceInCents', normalizePrice],
    ['numberCount', normalizeNumberCount],
    ['maxNumbersPerUser', normalizeMaxNumbersPerUser],
    ['drawingDate', normalizeDate],
    ['status', (value) => normalizeStatus(value, null)],
  ];
  for (const [field, normalizer] of checks) {
    if (!Object.hasOwn(payload, field)) continue;
    const normalized = normalizer(payload[field]);
    if (normalized === null) return null;
    fields[field] = normalized;
  }
  return Object.keys(fields).length ? fields : null;
}

function raffleIdFrom(event) {
  const raffleId = event.pathParameters?.raffleId;
  return typeof raffleId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(raffleId) ? raffleId : null;
}

async function getOwnedRaffle(raffleId, ownerSub) {
  const result = await dynamo.send(new GetCommand({
    TableName: tableName,
    Key: { raffleId },
    ConsistentRead: true,
  }));
  return result.Item?.organizerSub === ownerSub ? result.Item : null;
}

async function list(event, ownerSub) {
  const query = event.queryStringParameters || {};
  const limitValue = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limitValue) || limitValue < 1) return json(400, { message: 'O parâmetro limit deve ser um inteiro positivo.' });
  const limit = Math.min(MAX_PAGE_SIZE, limitValue);
  let result;
  try {
    result = await queryOwnedRaffles(ownerSub, { limit, nextToken: query.nextToken });
  } catch (error) {
    if (error.message === 'O parâmetro nextToken é inválido.') return json(400, { message: error.message });
    throw error;
  }
  const items = (result.Items || []).map(toOwnedRaffle);
  return json(200, { items, count: items.length, nextToken: encodeKey(result.LastEvaluatedKey) });
}

async function dashboard(ownerSub) {
  const items = await queryOwnedRafflesConsistently(ownerSub);

  const summary = items.reduce((total, raffle) => {
    const reserved = Number(raffle.reservedCount || 0);
    const confirmed = Number(raffle.confirmedCount || 0);
    const price = Number(raffle.priceInCents || 0);
    total.reservedNumbers += reserved;
    total.confirmedNumbers += confirmed;
    total.confirmedRevenueInCents += confirmed * price;
    total.reservedAmountInCents += reserved * price;
    if (raffle.status === 'ACTIVE') total.activeRaffles += 1;
    else if (raffle.status === 'DRAFT') total.draftRaffles += 1;
    else if (raffle.status === 'DRAWN') total.drawnRaffles += 1;
    else if (raffle.status === 'INACTIVE') total.inactiveRaffles += 1;
    return total;
  }, {
    raffleCount: items.length,
    activeRaffles: 0,
    draftRaffles: 0,
    drawnRaffles: 0,
    inactiveRaffles: 0,
    reservedNumbers: 0,
    confirmedNumbers: 0,
    confirmedRevenueInCents: 0,
    reservedAmountInCents: 0,
  });
  return json(200, { summary, items: items.map(toOwnedRaffle) });
}

function organizerSettingsKey(ownerSub) {
  return { configKey: `ORGANIZER_SETTINGS#${ownerSub}` };
}

function completionDelayDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= MIN_COMPLETION_DELAY_DAYS && days <= MAX_COMPLETION_DELAY_DAYS
    ? days
    : DEFAULT_COMPLETION_DELAY_DAYS;
}

async function getOrganizerRaffleSettings(ownerSub) {
  if (!appConfigTable) throw new Error('Missing APP_CONFIG_TABLE configuration.');
  const result = await dynamo.send(new GetCommand({
    TableName: appConfigTable,
    Key: organizerSettingsKey(ownerSub),
    ConsistentRead: true,
  }));
  return {
    completionDelayDays: completionDelayDays(result.Item?.completionDelayDays),
    updatedAt: result.Item?.updatedAt || '',
  };
}

async function saveOrganizerRaffleSettings(event, owner) {
  if (!appConfigTable || !auditEventsTable) return json(500, { message: 'As configurações ainda não estão disponíveis.' });
  const payload = readBody(event);
  const days = Number(payload?.completionDelayDays);
  if (!Number.isInteger(days) || days < MIN_COMPLETION_DELAY_DAYS || days > MAX_COMPLETION_DELAY_DAYS) {
    return json(400, { message: 'Informe um prazo entre 1 e 365 dias após o sorteio.' });
  }
  const now = new Date().toISOString();
  const item = { ...organizerSettingsKey(owner.sub), completionDelayDays: days, updatedAt: now };
  await dynamo.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: appConfigTable, Item: item } },
      auditPut(owner, {
        action: 'ORGANIZER_SETTINGS_UPDATED',
        occurredAt: now,
        details: { completionDelayDays: days },
      }),
    ],
  }));
  return json(200, { settings: { completionDelayDays: days, updatedAt: now } });
}

function monthEpochBounds(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(`${month}-01T00:00:00-03:00`);
  const nextStart = new Date(Date.UTC(year, monthNumber, 1, 3, 0, 0));
  if (Number.isNaN(start.valueOf()) || Number.isNaN(nextStart.valueOf())) return null;
  return {
    startEpoch: Math.floor(start.getTime() / 1000),
    endEpoch: Math.floor(nextStart.getTime() / 1000) - 1,
  };
}

async function confirmedAndPendingTransactionsForMonth(raffleId, bounds) {
  const orders = [];
  let exclusiveStartKey;
  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: transactionsTable,
      IndexName: transactionsIndex,
      KeyConditionExpression: '#raffleId = :raffleId AND #createdAtEpoch BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#raffleId': 'raffleId', '#createdAtEpoch': 'createdAtEpoch' },
      ExpressionAttributeValues: {
        ':raffleId': raffleId,
        ':from': bounds.startEpoch - 15 * 60,
        ':to': bounds.endEpoch + 15 * 60,
      },
      ScanIndexForward: true,
      Limit: MAX_PAGE_SIZE,
      ExclusiveStartKey: exclusiveStartKey,
    }));
    const keys = (result.Items || []).filter((item) => typeof item.transactionId === 'string')
      .map((item) => ({ transactionId: item.transactionId }));
    for (let offset = 0; offset < keys.length; offset += 100) {
      let pendingKeys = keys.slice(offset, offset + 100);
      for (let attempt = 0; pendingKeys.length && attempt < 5; attempt += 1) {
        const batch = await dynamo.send(new BatchGetCommand({
          RequestItems: { [transactionsTable]: { Keys: pendingKeys, ConsistentRead: true } },
        }));
        orders.push(...(batch.Responses?.[transactionsTable] || []));
        pendingKeys = batch.UnprocessedKeys?.[transactionsTable]?.Keys || [];
        if (pendingKeys.length && attempt < 4) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
      }
      if (pendingKeys.length) throw new Error('Could not read all monthly raffle transactions.');
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return orders;
}

async function finance(event, ownerSub) {
  const query = event.queryStringParameters || {};
  const month = query.month || '';
  const bounds = month ? monthEpochBounds(month) : null;
  if (month && !bounds) return json(400, { message: 'Informe um mês válido no formato AAAA-MM.' });
  const raffleId = query.raffleId || '';
  if (raffleId && !/^[a-zA-Z0-9_-]{1,100}$/.test(raffleId)) {
    return json(400, { message: 'O identificador da rifa é inválido.' });
  }
  let raffles = await queryOwnedRafflesConsistently(ownerSub);
  if (raffleId) {
    raffles = raffles.filter((raffle) => raffle.raffleId === raffleId);
    if (!raffles.length) return json(404, { message: 'Rifa não encontrada.' });
  }
  const items = raffles.map((raffle) => {
    const numberCount = Number(raffle.numberCount || 0);
    const unitPriceInCents = Number(raffle.priceInCents || 0);
    const reservedNumbers = Number(raffle.reservedCount || 0);
    const confirmedNumbers = Number(raffle.confirmedCount || 0);
    return {
      id: raffle.raffleId,
      title: raffle.title || 'Rifa sem título',
      status: raffle.status || 'DRAFT',
      unitPriceInCents,
      numberCount,
      reservedNumbers,
      pendingAmountInCents: reservedNumbers * unitPriceInCents,
      confirmedNumbers,
      confirmedRevenueInCents: confirmedNumbers * unitPriceInCents,
      availableNumbers: Math.max(0, numberCount - reservedNumbers - confirmedNumbers),
      financialsLocked: raffle.financialsLocked === true || reservedNumbers > 0 || confirmedNumbers > 0,
      ...(month ? { createdAt: raffle.createdAt || '' } : {}),
    };
  });
  if (month) {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const monthly = await Promise.all(raffles.map(async (raffle) => {
      const orders = await confirmedAndPendingTransactionsForMonth(raffle.raffleId, bounds);
      let reservedNumbers = 0;
      let pendingAmountInCents = 0;
      let confirmedNumbers = 0;
      let confirmedRevenueInCents = 0;
      for (const order of orders) {
        const createdAtEpoch = Number(order.createdAtEpoch || 0);
        const confirmedAtEpoch = order.paymentConfirmedAt ? Math.floor(new Date(order.paymentConfirmedAt).getTime() / 1000) : 0;
        const quantity = Number(order.quantity || order.numbers?.length || 0);
        const amount = Number(order.amountInCents || 0);
        if (order.status === 'CONFIRMED' && confirmedAtEpoch >= bounds.startEpoch && confirmedAtEpoch <= bounds.endEpoch) {
          confirmedNumbers += quantity;
          confirmedRevenueInCents += amount;
        } else if (order.status === 'PENDING' && createdAtEpoch >= bounds.startEpoch && createdAtEpoch <= bounds.endEpoch
          && Number(order.expiresAtEpoch || 0) > nowEpoch) {
          reservedNumbers += quantity;
          pendingAmountInCents += amount;
        }
      }
      return { raffleId: raffle.raffleId, reservedNumbers, pendingAmountInCents, confirmedNumbers, confirmedRevenueInCents };
    }));
    const monthlyByRaffle = new Map(monthly.map((item) => [item.raffleId, item]));
    for (const item of items) {
      const aggregate = monthlyByRaffle.get(item.id);
      item.reservedNumbers = aggregate?.reservedNumbers || 0;
      item.pendingAmountInCents = aggregate?.pendingAmountInCents || 0;
      item.confirmedNumbers = aggregate?.confirmedNumbers || 0;
      item.confirmedRevenueInCents = aggregate?.confirmedRevenueInCents || 0;
    }
  }
  const summary = items.reduce((total, raffle) => {
    total.reservedNumbers += raffle.reservedNumbers;
    total.pendingAmountInCents += raffle.pendingAmountInCents;
    total.confirmedNumbers += raffle.confirmedNumbers;
    total.confirmedRevenueInCents += raffle.confirmedRevenueInCents;
    total.availableNumbers += raffle.availableNumbers;
    return total;
  }, {
    raffleCount: items.length,
    reservedNumbers: 0,
    pendingAmountInCents: 0,
    confirmedNumbers: 0,
    confirmedRevenueInCents: 0,
    availableNumbers: 0,
  });
  return json(200, { summary, items, updatedAt: new Date().toISOString(), filters: { month: month || null, raffleId: raffleId || null } });
}

async function create(event, owner) {
  const payload = readBody(event);
  const data = validateCreate(payload);
  if (!data) return json(400, { message: 'Confira os dados e envie a imagem da rifa pelo upload do painel.' });

  const raffleId = randomUUID();
  const now = new Date().toISOString();
  const item = {
    raffleId,
    organizerSub: owner.sub,
    organizer: normalizeText(payload.organizer, { min: 1, max: 120 }) || owner.label,
    ...data,
    numberCount: data.numberCount,
    sortOrder: Date.now(),
    reservedCount: 0,
    confirmedCount: 0,
    financialsLocked: false,
    financialsHistoryChecked: true,
    featured: false,
    createdAt: now,
    updatedAt: now,
  };
  if (data.status === 'ACTIVE') item.publicStatus = 'ACTIVE';

  await dynamo.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(raffleId)',
        },
      },
      auditPut(owner, {
        action: 'RAFFLE_CREATED',
        raffleId,
        raffleTitle: item.title,
        occurredAt: now,
        details: { status: item.status },
      }),
    ],
  }));
  return json(201, { item: toOwnedRaffle(item) });
}

async function update(event, owner) {
  const raffleId = raffleIdFrom(event);
  if (!raffleId) return json(400, { message: 'O identificador da rifa é inválido.' });
  const current = await getOwnedRaffle(raffleId, owner.sub);
  if (!current) return json(404, { message: 'Rifa não encontrada.' });
  if (current.status === 'DRAWN' || current.status === 'COMPLETED' || current.drawResult) {
    return json(409, { message: 'Rifas sorteadas ou concluídas não podem mais ser editadas.' });
  }
  const fields = validatePatch(readBody(event));
  if (!fields) return json(400, { message: 'Informe ao menos um campo válido para atualizar.' });
  if (Object.hasOwn(fields, 'status')) {
    if (fields.status === 'DRAWN' && (current.status !== 'DRAWN' || !current.drawResult)) {
      return json(400, { message: 'O status de rifa sorteada só pode ser definido pela operação de sorteio.' });
    }
    if (current.drawResult && !['DRAWN', 'INACTIVE'].includes(fields.status)) {
      return json(409, { message: 'Uma rifa sorteada só pode permanecer no histórico ou ser inativada.' });
    }
  }
  if (Object.hasOwn(fields, 'image') && fields.image !== current.image && !isManagedRaffleImage(fields.image)) {
    return json(400, { message: 'Envie a nova imagem da rifa pelo upload do painel.' });
  }

  const pricingChanged = Object.hasOwn(fields, 'priceInCents') && fields.priceInCents !== current.priceInCents;
  const quantityChanged = Object.hasOwn(fields, 'numberCount') && fields.numberCount !== current.numberCount;
  const currentPrizeValueInCents = Number.isSafeInteger(Number(current.prizeValueInCents))
    ? Number(current.prizeValueInCents)
    : parseLegacyPrizeValue(current.prizeValue);
  const updatedPrizeValueInCents = fields.prizeValueInCents ?? currentPrizeValueInCents;
  const updatedNumberCount = fields.numberCount ?? Number(current.numberCount);
  const updatedPriceInCents = fields.priceInCents ?? Number(current.priceInCents);
  const updatedMaxNumbersPerUser = fields.maxNumbersPerUser
    ?? Number(current.maxNumbersPerUser || Math.min(MAX_NUMBERS_PER_USER, updatedNumberCount));
  const financialFieldsChanged = pricingChanged || quantityChanged
    || (Object.hasOwn(fields, 'prizeValueInCents') && fields.prizeValueInCents !== currentPrizeValueInCents);
  if (!Number.isSafeInteger(updatedPrizeValueInCents)
    || !Number.isSafeInteger(updatedPriceInCents * updatedNumberCount)
    || updatedPrizeValueInCents !== updatedPriceInCents * updatedNumberCount) {
    return json(400, { message: 'O valor total do prêmio deve ser igual ao valor por número multiplicado pela quantidade de números.' });
  }
  if (updatedMaxNumbersPerUser > updatedNumberCount) {
    return json(400, { message: 'O limite por participante não pode ser maior que o total de números da rifa.' });
  }
  const hasSales = current.financialsLocked === true
    || Number(current.reservedCount || 0) > 0
    || Number(current.confirmedCount || 0) > 0;
  const lockCheckedCurrent = financialFieldsChanged && !hasSales
    ? await ensureHistoricalFinancialLock(current, owner.sub)
    : current;
  if ((hasSales || lockCheckedCurrent.financialsLocked === true) && financialFieldsChanged) {
    return json(409, { message: 'Valor total do prêmio, preço por número e quantidade ficam travados permanentemente após a primeira reserva.' });
  }

  const changedFields = Object.keys(fields).filter((field) => {
    if (field === 'prizeValueInCents') return fields[field] !== currentPrizeValueInCents;
    return fields[field] !== current[field];
  });
  if (!changedFields.length) return json(200, { item: toOwnedRaffle(current), unchanged: true });

  const now = new Date().toISOString();
  const names = { '#owner': 'organizerSub', '#updatedAt': 'updatedAt' };
  const values = { ':owner': owner.sub, ':updatedAt': now };
  const sets = ['#updatedAt = :updatedAt'];
  const removes = [];
  for (const [field, value] of Object.entries(fields)) {
    if (field === 'status') {
      names['#status'] = 'status';
      values[':status'] = value;
      sets.push('#status = :status');
      names['#publicStatus'] = 'publicStatus';
      names['#featuredStatus'] = 'featuredStatus';
      if (value === 'ACTIVE') {
        values[':active'] = 'ACTIVE';
        sets.push('#publicStatus = :active');
        if (current.featured) {
          names['#featured'] = 'featured';
          names['#featuredStatus'] = 'featuredStatus';
          values[':featured'] = true;
          sets.push('#featured = :featured', '#featuredStatus = :active');
        } else {
          removes.push('#featuredStatus');
        }
      } else if (value === 'DRAWN') {
        values[':drawn'] = 'DRAWN';
        values[':notFeatured'] = false;
        sets.push('#publicStatus = :drawn', '#featured = :notFeatured');
        names['#featured'] = 'featured';
        removes.push('#featuredStatus');
      } else {
        removes.push('#publicStatus');
        names['#featured'] = 'featured';
        values[':notFeatured'] = false;
        sets.push('#featured = :notFeatured');
        names['#featuredStatus'] = 'featuredStatus';
        removes.push('#featuredStatus');
      }
      continue;
    }
    names[`#${field}`] = field;
    if (value === '') {
      removes.push(`#${field}`);
    } else {
      values[`:${field}`] = value;
      sets.push(`#${field} = :${field}`);
      if (field === 'prizeValueInCents') {
        names['#prizeValue'] = 'prizeValue';
        values[':prizeValue'] = formatMoneyInCents(value);
        sets.push('#prizeValue = :prizeValue');
      }
    }
  }

  let condition = '#owner = :owner';
  if (financialFieldsChanged) {
    names['#reservedCount'] = 'reservedCount';
    names['#confirmedCount'] = 'confirmedCount';
    names['#financialsLocked'] = 'financialsLocked';
    values[':zero'] = 0;
    values[':unlocked'] = false;
    condition += ' AND (attribute_not_exists(#financialsLocked) OR #financialsLocked = :unlocked) AND (attribute_not_exists(#reservedCount) OR #reservedCount = :zero) AND (attribute_not_exists(#confirmedCount) OR #confirmedCount = :zero)';
  }
  const updateExpression = `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`;

  const statusChanged = Object.hasOwn(fields, 'status') && fields.status !== current.status;
  const auditAction = statusChanged ? 'RAFFLE_STATUS_CHANGED' : 'RAFFLE_UPDATED';
  const changes = Object.fromEntries(changedFields.map((field) => {
    const previousValue = field === 'prizeValueInCents'
      ? currentPrizeValueInCents
      : current[field] ?? null;
    const nextValue = fields[field] === '' ? null : fields[field];
    return [field, { from: previousValue, to: nextValue }];
  }));
  const auditDetails = {
    changedFields,
    changes,
    ...(statusChanged ? { previousStatus: current.status || 'DRAFT', newStatus: fields.status } : {}),
  };
  try {
    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName,
            Key: { raffleId },
            UpdateExpression: updateExpression,
            ConditionExpression: condition,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
          },
        },
        auditPut(owner, {
          action: auditAction,
          raffleId,
          raffleTitle: fields.title || current.title || '',
          occurredAt: now,
          details: auditDetails,
        }),
      ],
    }));
    const updated = await getOwnedRaffle(raffleId, owner.sub);
    return updated ? json(200, { item: toOwnedRaffle(updated) }) : json(404, { message: 'Rifa não encontrada.' });
  } catch (error) {
    if (error?.name === 'ConditionalCheckFailedException' || error?.name === 'TransactionCanceledException'
      || error?.name === 'TransactionConflictException') {
      return json(409, { message: 'A rifa ou os números vinculados a ela mudaram. Atualize os dados e tente novamente.' });
    }
    throw error;
  }
}

function currentSaoPauloDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function maskWinnerName(value) {
  const parts = typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : [];
  const firstName = parts[0] || 'Participante';
  const surname = parts.at(-1);
  return parts.length > 1 ? `${firstName} ${Array.from(surname)[0].toLocaleUpperCase('pt-BR')}.` : firstName;
}

async function confirmedNumbersForDraw(raffleId, totalNumbers) {
  const entries = [];
  const seenNumbers = new Set();
  let exclusiveStartKey;

  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: transactionsTable,
      IndexName: transactionsIndex,
      KeyConditionExpression: '#raffleId = :raffleId',
      ExpressionAttributeNames: { '#raffleId': 'raffleId' },
      ExpressionAttributeValues: { ':raffleId': raffleId },
      Limit: MAX_PAGE_SIZE,
      ExclusiveStartKey: exclusiveStartKey,
      ScanIndexForward: true,
    }));
    const keys = (result.Items || []).filter((item) => typeof item.transactionId === 'string')
      .map((item) => ({ transactionId: item.transactionId }));

    for (let offset = 0; offset < keys.length; offset += 100) {
      let remainingKeys = keys.slice(offset, offset + 100);
      let orders = [];
      for (let attempt = 0; remainingKeys.length && attempt < 5; attempt += 1) {
        const batch = await dynamo.send(new BatchGetCommand({
          RequestItems: { [transactionsTable]: { Keys: remainingKeys, ConsistentRead: true } },
        }));
        orders.push(...(batch.Responses?.[transactionsTable] || []));
        remainingKeys = batch.UnprocessedKeys?.[transactionsTable]?.Keys || [];
        if (remainingKeys.length && attempt < 4) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
      }
      if (remainingKeys.length) throw new Error('Could not read all raffle transactions for draw.');

      for (const order of orders) {
        if (order.raffleId !== raffleId || order.status !== 'CONFIRMED') continue;
        if (!Array.isArray(order.numbers) || !order.numbers.length) {
          throw new Error('A confirmed raffle transaction has no numbers.');
        }
        for (const value of order.numbers) {
          const number = Number(value);
          if (!Number.isSafeInteger(number) || number < 1 || number > totalNumbers || seenNumbers.has(number)) {
            throw new Error('Confirmed raffle numbers are invalid or duplicated.');
          }
          seenNumbers.add(number);
          entries.push({
            number,
            transactionId: order.transactionId,
            winnerName: maskWinnerName(order.customer?.name),
          });
        }
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return entries;
}

async function drawRaffle(event, owner) {
  if (!transactionsTable || !raffleNumbersTable || !appConfigTable) {
    return json(500, { message: 'O sorteio ainda não está configurado no backend.' });
  }
  const raffleId = raffleIdFrom(event);
  if (!raffleId) return json(400, { message: 'O identificador da rifa é inválido.' });
  const raffle = await getOwnedRaffle(raffleId, owner.sub);
  if (!raffle) return json(404, { message: 'Rifa não encontrada.' });
  if (raffle.status === 'DRAWN' && raffle.drawResult) {
    return json(200, { item: toOwnedRaffle(raffle), alreadyDrawn: true });
  }
  if (raffle.status !== 'ACTIVE') {
    return json(409, { message: 'Somente uma rifa ativa pode ser sorteada.' });
  }
  if (typeof raffle.drawingDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raffle.drawingDate)
    || raffle.drawingDate > currentSaoPauloDate()) {
    return json(409, { message: 'A data prevista para o sorteio ainda não chegou.' });
  }
  const confirmedCount = Number(raffle.confirmedCount || 0);
  const reservedCount = Number(raffle.reservedCount || 0);
  const totalNumbers = Number(raffle.numberCount || 0);
  if (!Number.isSafeInteger(confirmedCount) || confirmedCount < 1 || !Number.isSafeInteger(totalNumbers) || totalNumbers < 1) {
    return json(409, { message: 'Ainda não há números com pagamento confirmado para participar do sorteio.' });
  }

  const eligibleNumbers = await confirmedNumbersForDraw(raffleId, totalNumbers);
  if (eligibleNumbers.length !== confirmedCount) {
    return json(409, { message: 'Não foi possível validar todas as participações confirmadas. Atualize os dados financeiros e tente novamente.' });
  }
  const winner = eligibleNumbers[randomInt(eligibleNumbers.length)];
  const drawnAt = new Date().toISOString();
  const drawnAtEpoch = Math.floor(new Date(drawnAt).getTime() / 1000);
  const settings = await getOrganizerRaffleSettings(owner.sub);
  const completionAtEpoch = drawnAtEpoch + settings.completionDelayDays * 24 * 60 * 60;
  const drawResult = {
    number: winner.number,
    winnerName: winner.winnerName,
    drawnAt,
  };
  const raffleUpdate = {
    Update: {
      TableName: tableName,
      Key: { raffleId },
      UpdateExpression: 'SET #status = :drawn, #publicStatus = :drawn, #drawResult = :drawResult, #completionStatus = :pendingCompletion, #completionAtEpoch = :completionAtEpoch, #featured = :notFeatured, #updatedAt = :updatedAt REMOVE #featuredStatus',
      ConditionExpression: '#owner = :owner AND #status = :active AND #numberCount = :numberCount AND #confirmedCount = :confirmedCount AND #drawingDate = :drawingDate AND ((attribute_not_exists(#reservedCount) AND :reservedCount = :zero) OR #reservedCount = :reservedCount) AND attribute_not_exists(#drawResult)',
      ExpressionAttributeNames: {
        '#owner': 'organizerSub',
        '#status': 'status',
        '#publicStatus': 'publicStatus',
        '#drawResult': 'drawResult',
        '#completionStatus': 'completionStatus',
        '#completionAtEpoch': 'completionAtEpoch',
        '#featured': 'featured',
        '#featuredStatus': 'featuredStatus',
        '#updatedAt': 'updatedAt',
        '#numberCount': 'numberCount',
        '#confirmedCount': 'confirmedCount',
        '#reservedCount': 'reservedCount',
        '#drawingDate': 'drawingDate',
      },
      ExpressionAttributeValues: {
        ':owner': owner.sub,
        ':drawn': 'DRAWN',
        ':drawResult': drawResult,
        ':pendingCompletion': 'PENDING',
        ':completionAtEpoch': completionAtEpoch,
        ':notFeatured': false,
        ':updatedAt': drawnAt,
        ':active': 'ACTIVE',
        ':numberCount': totalNumbers,
        ':confirmedCount': confirmedCount,
        ':drawingDate': raffle.drawingDate,
        ':zero': 0,
        ':reservedCount': reservedCount,
      },
    },
  };
  const transactionItems = [
    raffleUpdate,
    {
      ConditionCheck: {
        TableName: transactionsTable,
        Key: { transactionId: winner.transactionId },
        ConditionExpression: '#status = :confirmed AND contains(#numbers, :number)',
        ExpressionAttributeNames: { '#status': 'status', '#numbers': 'numbers' },
        ExpressionAttributeValues: { ':confirmed': 'CONFIRMED', ':number': winner.number },
      },
    },
    {
      ConditionCheck: {
        TableName: raffleNumbersTable,
        Key: { raffleId, number: winner.number },
        ConditionExpression: '#status = :confirmed AND #reservationId = :transactionId',
        ExpressionAttributeNames: { '#status': 'status', '#reservationId': 'reservationId' },
        ExpressionAttributeValues: { ':confirmed': 'CONFIRMED', ':transactionId': winner.transactionId },
      },
    },
  ];
  transactionItems.push(auditPut(owner, {
    action: 'RAFFLE_DRAWN',
    raffleId,
    raffleTitle: raffle.title || '',
    occurredAt: drawnAt,
    details: { winningNumber: winner.number, confirmedNumberCount: confirmedCount },
  }));

  if (raffle.featured) {
    const configResult = await dynamo.send(new GetCommand({
      TableName: appConfigTable,
      Key: { configKey: HOME_FEATURED_CONFIG_KEY },
      ConsistentRead: true,
    }));
    if (configResult.Item?.featuredRaffleId === raffleId) {
      transactionItems.push({
        Update: {
          TableName: appConfigTable,
          Key: { configKey: HOME_FEATURED_CONFIG_KEY },
          UpdateExpression: 'SET #updatedAt = :updatedAt REMOVE #featuredRaffleId',
          ConditionExpression: '#featuredRaffleId = :raffleId',
          ExpressionAttributeNames: { '#updatedAt': 'updatedAt', '#featuredRaffleId': 'featuredRaffleId' },
          ExpressionAttributeValues: { ':updatedAt': drawnAt, ':raffleId': raffleId },
        },
      });
    }
  }

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactionItems }));
    const updated = await getOwnedRaffle(raffleId, owner.sub);
    return json(200, { item: toOwnedRaffle(updated) });
  } catch (error) {
    if (error?.name === 'TransactionCanceledException' || error?.name === 'TransactionConflictException') {
      const latest = await getOwnedRaffle(raffleId, owner.sub);
      if (latest?.status === 'DRAWN' && latest.drawResult) {
        return json(200, { item: toOwnedRaffle(latest), alreadyDrawn: true });
      }
      return json(409, { message: 'A rifa ou as participações mudaram durante o sorteio. Atualize os dados e tente novamente.' });
    }
    throw error;
  }
}

async function createRaffleImageUpload(event, owner) {
  if (!imagesBucket || !imagesPublicBaseUrl) {
    return json(500, { message: 'O envio de imagens ainda não está configurado.' });
  }
  const payload = readBody(event);
  const contentType = payload?.contentType;
  const size = Number(payload?.size);
  const extension = RAFFLE_IMAGE_TYPES[contentType];
  if (!extension || !Number.isSafeInteger(size) || size < 1 || size > MAX_RAFFLE_IMAGE_BYTES) {
    return json(400, { message: 'Envie uma imagem JPG, PNG, WebP ou AVIF de até 5 MB.' });
  }

  const key = `raffle-images/${randomUUID()}.${extension}`;
  const signedPost = await createPresignedPost(s3, {
    Bucket: imagesBucket,
    Key: key,
    Expires: 300,
    Fields: { key, 'Content-Type': contentType },
    Conditions: [
      ['eq', '$key', key],
      ['eq', '$Content-Type', contentType],
      ['content-length-range', 1, MAX_RAFFLE_IMAGE_BYTES],
    ],
  });
  const baseUrl = imagesPublicBaseUrl.replace(/\/+$/, '');
  return json(200, {
    uploadUrl: signedPost.url,
    fields: signedPost.fields,
    imageUrl: `${baseUrl}/${key}`,
  });
}

async function listCurrentlyFeaturedRaffles() {
  const items = [];
  let exclusiveStartKey;
  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: tableName,
      IndexName: featuredIndex,
      KeyConditionExpression: '#featuredStatus = :active',
      ExpressionAttributeNames: { '#featuredStatus': 'featuredStatus' },
      ExpressionAttributeValues: { ':active': 'ACTIVE' },
      Limit: MAX_PAGE_SIZE,
      ExclusiveStartKey: exclusiveStartKey,
    }));
    items.push(...(result.Items || []));
    if (items.length > MAX_PAGE_SIZE - 2) return null;
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

async function setHomeFeaturedRaffle(event, owner) {
  if (!appConfigTable) return json(500, { message: 'A configuração de destaque não está disponível.' });
  const payload = readBody(event);
  if (!payload || !Object.hasOwn(payload, 'raffleId')) {
    return json(400, { message: 'Informe a rifa que deve ficar em destaque ou null para remover o destaque.' });
  }
  const nextRaffleId = payload.raffleId === null || payload.raffleId === ''
    ? null
    : raffleIdFrom({ pathParameters: { raffleId: payload.raffleId } });
  if (payload.raffleId !== null && payload.raffleId !== '' && !nextRaffleId) {
    return json(400, { message: 'O identificador da rifa é inválido.' });
  }

  let nextRaffle;
  if (nextRaffleId) {
    nextRaffle = await getOwnedRaffle(nextRaffleId, owner.sub);
    if (!nextRaffle) return json(404, { message: 'Rifa não encontrada.' });
    if (nextRaffle.status !== 'ACTIVE') {
      return json(400, { message: 'Somente uma rifa ativa pode aparecer em destaque.' });
    }
  }

  const configKey = { configKey: HOME_FEATURED_CONFIG_KEY };
  const configResult = await dynamo.send(new GetCommand({
    TableName: appConfigTable,
    Key: configKey,
    ConsistentRead: true,
  }));
  const config = configResult.Item;
  const previousRaffleId = typeof config?.featuredRaffleId === 'string' ? config.featuredRaffleId : null;
  if (previousRaffleId === nextRaffleId && (!nextRaffleId || nextRaffle?.featured)) {
    return json(200, { item: nextRaffle ? toOwnedRaffle(nextRaffle) : null });
  }

  let oldFeaturedRaffles = [];
  if (previousRaffleId) {
    const previous = await dynamo.send(new GetCommand({
      TableName: tableName,
      Key: { raffleId: previousRaffleId },
      ConsistentRead: true,
    }));
    if (previous.Item) oldFeaturedRaffles = [previous.Item];
  } else {
    const current = await listCurrentlyFeaturedRaffles();
    if (!current) {
      return json(409, { message: 'Há muitas rifas marcadas como destaque. Remova os destaques antigos antes de escolher uma nova.' });
    }
    oldFeaturedRaffles = current;
  }

  const transactionItems = oldFeaturedRaffles
    .filter((item) => item.raffleId !== nextRaffleId)
    .map((item) => ({
      Update: {
        TableName: tableName,
        Key: { raffleId: item.raffleId },
        UpdateExpression: 'SET #featured = :false REMOVE #featuredStatus',
        ConditionExpression: 'attribute_exists(raffleId)',
        ExpressionAttributeNames: { '#featured': 'featured', '#featuredStatus': 'featuredStatus' },
        ExpressionAttributeValues: { ':false': false },
      },
    }));

  if (nextRaffleId && !nextRaffle?.featured) {
    transactionItems.push({
      Update: {
        TableName: tableName,
        Key: { raffleId: nextRaffleId },
        UpdateExpression: 'SET #featured = :true, #featuredStatus = :active',
        ConditionExpression: '#owner = :owner AND #status = :active',
        ExpressionAttributeNames: {
          '#featured': 'featured',
          '#featuredStatus': 'featuredStatus',
          '#owner': 'organizerSub',
          '#status': 'status',
        },
        ExpressionAttributeValues: { ':true': true, ':active': 'ACTIVE', ':owner': owner.sub },
      },
    });
  }

  const now = new Date().toISOString();
  if (config) {
    const expressionNames = { '#updatedAt': 'updatedAt', '#featuredRaffleId': 'featuredRaffleId' };
    const expressionValues = { ':updatedAt': now };
    const condition = previousRaffleId
      ? '#featuredRaffleId = :previousRaffleId'
      : 'attribute_not_exists(#featuredRaffleId)';
    if (previousRaffleId) expressionValues[':previousRaffleId'] = previousRaffleId;
    const updateExpression = nextRaffleId
      ? 'SET #featuredRaffleId = :nextRaffleId, #updatedAt = :updatedAt'
      : 'SET #updatedAt = :updatedAt REMOVE #featuredRaffleId';
    if (nextRaffleId) expressionValues[':nextRaffleId'] = nextRaffleId;
    transactionItems.push({
      Update: {
        TableName: appConfigTable,
        Key: configKey,
        UpdateExpression: updateExpression,
        ConditionExpression: condition,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      },
    });
  } else {
    transactionItems.push({
      Put: {
        TableName: appConfigTable,
        Item: {
          ...configKey,
          ...(nextRaffleId ? { featuredRaffleId: nextRaffleId } : {}),
          updatedAt: now,
        },
        ConditionExpression: 'attribute_not_exists(configKey)',
      },
    });
  }

  const affectedRaffle = nextRaffle || oldFeaturedRaffles[0];
  transactionItems.push(auditPut(owner, {
    action: 'FEATURED_RAFFLE_CHANGED',
    raffleId: nextRaffleId || previousRaffleId || affectedRaffle?.raffleId,
    raffleTitle: affectedRaffle?.title || '',
    occurredAt: now,
    details: { previousFeaturedRaffleId: previousRaffleId, nextFeaturedRaffleId: nextRaffleId },
  }));

  try {
    await dynamo.send(new TransactWriteCommand({ TransactItems: transactionItems }));
    if (!nextRaffleId) return json(200, { item: null });
    return json(200, { item: toOwnedRaffle({ ...nextRaffle, featured: true }) });
  } catch (error) {
    if (error?.name === 'TransactionCanceledException' || error?.name === 'TransactionConflictException') {
      return json(409, { message: 'O destaque mudou em outra operação. Atualize o painel e tente novamente.' });
    }
    throw error;
  }
}

async function raffleTransactions(event, ownerSub) {
  if (!transactionsTable) return json(500, { message: 'A consulta de participantes não está configurada.' });
  const raffleId = raffleIdFrom(event);
  if (!raffleId) return json(400, { message: 'O identificador da rifa é inválido.' });
  const raffle = await getOwnedRaffle(raffleId, ownerSub);
  if (!raffle) return json(404, { message: 'Rifa não encontrada.' });

  const query = event.queryStringParameters || {};
  const requestedLimit = query.limit === undefined ? DEFAULT_TRANSACTION_PAGE_SIZE : Number(query.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    return json(400, { message: 'O parâmetro limit deve ser um inteiro positivo.' });
  }
  let exclusiveStartKey;
  try {
    exclusiveStartKey = decodeTransactionKey(query.nextToken, raffleId);
  } catch (error) {
    return json(400, { message: error.message });
  }

  const result = await dynamo.send(new QueryCommand({
    TableName: transactionsTable,
    IndexName: transactionsIndex,
    KeyConditionExpression: '#raffleId = :raffleId',
    ExpressionAttributeNames: { '#raffleId': 'raffleId' },
    ExpressionAttributeValues: { ':raffleId': raffleId },
    ScanIndexForward: false,
    Limit: Math.min(MAX_PAGE_SIZE, requestedLimit),
    ExclusiveStartKey: exclusiveStartKey,
  }));

  const keys = (result.Items || []).filter((item) => typeof item.transactionId === 'string')
    .map((item) => ({ transactionId: item.transactionId }));
  let orders = [];
  if (keys.length) {
    let requestItems = { [transactionsTable]: { Keys: keys } };
    for (let attempt = 0; attempt < 4 && Object.keys(requestItems).length; attempt += 1) {
      const batch = await dynamo.send(new BatchGetCommand({ RequestItems: requestItems }));
      orders.push(...(batch.Responses?.[transactionsTable] || []));
      requestItems = batch.UnprocessedKeys || {};
      if (Object.keys(requestItems).length && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }

  const items = orders.filter((order) => order.raffleId === raffleId).map((order) => ({
    transactionId: order.transactionId,
    raffleId: order.raffleId,
    raffleTitle: order.raffleTitle || raffle.title,
    customer: {
      name: order.customer?.name || 'Participante',
      phone: order.customer?.phone || '',
    },
    numbers: Array.isArray(order.numbers) ? order.numbers : [],
    quantity: Number(order.quantity || 0),
    amountInCents: Number(order.amountInCents || 0),
    unitPriceInCents: Number(order.unitPriceInCents || 0),
    status: order.status || 'PENDING',
    createdAt: order.createdAt || '',
    expiresAt: order.expiresAt || '',
    paymentConfirmedAt: order.paymentConfirmedAt || '',
    paymentConfirmationMethod: order.paymentConfirmationMethod || '',
    isDemo: Boolean(order.isDemo),
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return json(200, {
    raffleId,
    items,
    count: items.length,
    nextToken: encodeKey(result.LastEvaluatedKey),
  });
}

async function confirmRaffleTransactionPayment(event, owner) {
  if (!transactionsTable || !raffleNumbersTable) {
    return json(500, { message: 'A confirmação de pagamentos ainda não está configurada.' });
  }
  const raffleId = raffleIdFrom(event);
  const transactionId = event.pathParameters?.transactionId;
  if (!raffleId || typeof transactionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(transactionId)) {
    return json(400, { message: 'O identificador da participação é inválido.' });
  }

  const raffle = await getOwnedRaffle(raffleId, owner.sub);
  if (!raffle) return json(404, { message: 'Rifa não encontrada.' });

  const orderResult = await dynamo.send(new GetCommand({
    TableName: transactionsTable,
    Key: { transactionId },
    ConsistentRead: true,
  }));
  const order = orderResult.Item;
  if (!order || order.raffleId !== raffleId) return json(404, { message: 'Participação não encontrada nesta rifa.' });
  if (order.status === 'CONFIRMED') {
    return json(200, {
      item: {
        transactionId,
        raffleId,
        status: 'CONFIRMED',
        paymentConfirmedAt: order.paymentConfirmedAt || '',
        paymentConfirmationMethod: order.paymentConfirmationMethod || '',
      },
      alreadyConfirmed: true,
    });
  }
  if (order.status !== 'PENDING') {
    return json(409, { message: 'Somente uma participação pendente pode ter o pagamento confirmado.' });
  }
  if (!Array.isArray(order.numbers) || order.numbers.length < 1 || order.numbers.length > MAX_NUMBERS_PER_USER) {
    return json(409, { message: 'Não foi possível validar os números desta participação.' });
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(Number(order.expiresAtEpoch)) || Number(order.expiresAtEpoch) <= nowEpoch) {
    return json(409, { message: 'O prazo desta reserva expirou. Ela não pode mais ser confirmada.' });
  }

  const confirmedAt = new Date().toISOString();
  const numberUpdates = order.numbers.map((number) => ({
    Update: {
      TableName: raffleNumbersTable,
      Key: { raffleId, number },
      UpdateExpression: 'SET #status = :confirmed REMOVE #reservedUntil, #reservedUntilEpoch',
      ConditionExpression: '#status = :reserved AND reservationId = :transactionId AND #reservedUntilEpoch > :nowEpoch',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#reservedUntil': 'reservedUntil',
        '#reservedUntilEpoch': 'reservedUntilEpoch',
      },
      ExpressionAttributeValues: {
        ':confirmed': 'CONFIRMED',
        ':reserved': 'RESERVED',
        ':transactionId': transactionId,
        ':nowEpoch': nowEpoch,
      },
    },
  }));

  try {
    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        ...numberUpdates,
        {
          Update: {
            TableName: tableName,
            Key: { raffleId },
            UpdateExpression: 'SET reservedCount = reservedCount - :quantity, confirmedCount = if_not_exists(confirmedCount, :zero) + :quantity, #financialsLocked = :locked, #historyChecked = :checked, #updatedAt = :confirmedAt',
            ConditionExpression: '#owner = :owner AND #status <> :drawn AND #status <> :completed AND reservedCount >= :quantity',
            ExpressionAttributeNames: {
              '#owner': 'organizerSub',
              '#status': 'status',
              '#financialsLocked': 'financialsLocked',
              '#historyChecked': 'financialsHistoryChecked',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':owner': owner.sub,
              ':drawn': 'DRAWN',
              ':completed': 'COMPLETED',
              ':quantity': order.numbers.length,
              ':zero': 0,
              ':locked': true,
              ':checked': true,
              ':confirmedAt': confirmedAt,
            },
          },
        },
        {
          Update: {
            TableName: transactionsTable,
            Key: { transactionId },
            UpdateExpression: 'SET #status = :confirmed, #paymentConfirmedAt = :confirmedAt, #paymentConfirmationMethod = :method, #paymentConfirmedBy = :owner REMOVE #pendingStatus, #expiresAtEpoch',
            ConditionExpression: '#status = :pending AND #raffleId = :raffleId AND #expiresAtEpoch > :nowEpoch',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#paymentConfirmedAt': 'paymentConfirmedAt',
              '#paymentConfirmationMethod': 'paymentConfirmationMethod',
              '#paymentConfirmedBy': 'paymentConfirmedBy',
              '#pendingStatus': 'pendingStatus',
              '#expiresAtEpoch': 'expiresAtEpoch',
              '#raffleId': 'raffleId',
            },
            ExpressionAttributeValues: {
              ':confirmed': 'CONFIRMED',
              ':confirmedAt': confirmedAt,
              ':method': 'MANUAL',
              ':owner': owner.sub,
              ':pending': 'PENDING',
              ':raffleId': raffleId,
              ':nowEpoch': nowEpoch,
            },
          },
        },
        auditPut(owner, {
          action: 'PAYMENT_CONFIRMED_MANUALLY',
          raffleId,
          raffleTitle: raffle.title || '',
          occurredAt: confirmedAt,
          details: {
            transactionId,
            numbers: order.numbers,
            amountInCents: Number(order.amountInCents || 0),
            paymentConfirmationMethod: 'MANUAL',
          },
        }),
      ],
    }));
    return json(200, {
      item: {
        transactionId,
        raffleId,
        status: 'CONFIRMED',
        paymentConfirmedAt: confirmedAt,
        paymentConfirmationMethod: 'MANUAL',
      },
    });
  } catch (error) {
    if (error?.name === 'TransactionCanceledException' || error?.name === 'TransactionConflictException') {
      const latest = await dynamo.send(new GetCommand({
        TableName: transactionsTable,
        Key: { transactionId },
        ConsistentRead: true,
      }));
      if (latest.Item?.raffleId === raffleId && latest.Item.status === 'CONFIRMED') {
        return json(200, {
          item: {
            transactionId,
            raffleId,
            status: 'CONFIRMED',
            paymentConfirmedAt: latest.Item.paymentConfirmedAt || '',
            paymentConfirmationMethod: latest.Item.paymentConfirmationMethod || '',
          },
          alreadyConfirmed: true,
        });
      }
      if (Number(latest.Item?.expiresAtEpoch || 0) <= nowEpoch) {
        return json(409, { message: 'O prazo desta reserva expirou. Ela não pode mais ser confirmada.' });
      }
      return json(409, { message: 'A reserva mudou ou perdeu a validade. Atualize a lista e confira os números antes de tentar novamente.' });
    }
    throw error;
  }
}

export const handler = async (event) => {
  if (!tableName) {
    console.error('Missing RAFFLES_TABLE environment variable.');
    return json(500, { message: 'A API de rifas do organizador não está configurada.' });
  }
  const owner = ownerFrom(event);
  if (!owner) return json(401, { message: 'Sessão do organizador inválida.' });

  const routeKey = event.routeKey || `${event.requestContext?.http?.method || event.httpMethod} ${event.rawPath || ''}`;
  try {
    if (routeKey === 'GET /api/v1/organizer/dashboard') return await dashboard(owner.sub);
    if (routeKey === 'GET /api/v1/organizer/finance') return await finance(event, owner.sub);
    if (routeKey === 'GET /api/v1/organizer/settings/raffles') {
      return json(200, { settings: await getOrganizerRaffleSettings(owner.sub) });
    }
    if (routeKey === 'PUT /api/v1/organizer/settings/raffles') return await saveOrganizerRaffleSettings(event, owner);
    if (routeKey === 'POST /api/v1/organizer/raffle-images/upload-url') return await createRaffleImageUpload(event, owner);
    if (routeKey === 'PUT /api/v1/organizer/home-featured-raffle') return await setHomeFeaturedRaffle(event, owner);
    if (routeKey === 'GET /api/v1/organizer/audit') return await listAuditEvents(event, owner);
    if (routeKey === 'GET /api/v1/organizer/support-tickets') return await listSupportTickets(event, owner.sub);
    if (routeKey === 'POST /api/v1/organizer/support-tickets') return await createSupportTicket(event, owner);
    if (routeKey === 'GET /api/v1/organizer/raffles') return await list(event, owner.sub);
    if (routeKey === 'POST /api/v1/organizer/raffles') return await create(event, owner);
    if (routeKey === 'GET /api/v1/organizer/raffles/{raffleId}') {
      const raffleId = raffleIdFrom(event);
      if (!raffleId) return json(400, { message: 'O identificador da rifa é inválido.' });
      const item = await getOwnedRaffle(raffleId, owner.sub);
      return item ? json(200, { item: toOwnedRaffle(item) }) : json(404, { message: 'Rifa não encontrada.' });
    }
    if (routeKey === 'GET /api/v1/organizer/raffles/{raffleId}/transactions') {
      return await raffleTransactions(event, owner.sub);
    }
    if (routeKey === 'POST /api/v1/organizer/raffles/{raffleId}/transactions/{transactionId}/confirm') {
      return await confirmRaffleTransactionPayment(event, owner);
    }
    if (routeKey === 'POST /api/v1/organizer/raffles/{raffleId}/draw') {
      return await drawRaffle(event, owner);
    }
    if (routeKey === 'PATCH /api/v1/organizer/raffles/{raffleId}') return await update(event, owner);
    return json(404, { message: 'Rota do organizador não encontrada.' });
  } catch (error) {
    console.error('Organizer raffle request failed.', {
      name: error?.name || 'UnknownError',
      routeKey,
      requestId: event.requestContext?.requestId,
    });
    return json(500, { message: 'Não foi possível concluir a operação da rifa agora.' });
  }
};
