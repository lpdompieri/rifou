import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const accessRequestsTable = process.env.ACCESS_REQUESTS_TABLE;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RETENTION_DAYS = 180;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

function readBody(event) {
  if (typeof event.body !== 'string' || !event.body) return null;
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeRequest(payload) {
  const name = typeof payload?.name === 'string'
    ? payload.name.trim().replace(/\s+/g, ' ')
    : '';
  const email = typeof payload?.email === 'string'
    ? payload.email.trim().toLowerCase()
    : '';
  let phoneDigits = typeof payload?.phone === 'string'
    ? payload.phone.replace(/\D/g, '')
    : '';

  if (phoneDigits.startsWith('55') && (phoneDigits.length === 12 || phoneDigits.length === 13)) {
    phoneDigits = phoneDigits.slice(2);
  }
  if (name.length < 3 || name.length > 120
    || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || (phoneDigits.length !== 10 && phoneDigits.length !== 11)) {
    return null;
  }

  return { name, email, phone: `+55${phoneDigits}` };
}

export const handler = async (event) => {
  if (!accessRequestsTable) {
    console.error('Missing access requests table environment variable.');
    return json(500, { message: 'Não foi possível registrar sua solicitação agora.' });
  }

  const request = normalizeRequest(readBody(event));
  if (!request) {
    return json(400, { message: 'Confira seu nome, e-mail e WhatsApp com DDD.' });
  }

  const requestId = randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = Math.floor(Date.now() / 1000) + RETENTION_DAYS * 24 * 60 * 60;

  try {
    await dynamo.send(new PutCommand({
      TableName: accessRequestsTable,
      Item: {
        requestId,
        ...request,
        status: 'PENDING',
        createdAt,
        expiresAt,
      },
      ConditionExpression: 'attribute_not_exists(requestId)',
    }));
    console.info('Created organizer access request.', {
      requestId,
      createdAt,
      requestIdFromGateway: event.requestContext?.requestId,
    });
    return json(202, {
      message: 'Solicitação enviada para análise. Se aprovada, você receberá as instruções de acesso por e-mail.',
    });
  } catch (error) {
    console.error('Failed to create organizer access request.', {
      name: error?.name || 'UnknownError',
      requestIdFromGateway: event.requestContext?.requestId,
    });
    return json(500, { message: 'Não foi possível registrar sua solicitação agora. Tente novamente.' });
  }
};
