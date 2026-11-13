import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const rafflesTable = process.env.RAFFLES_TABLE;
const appConfigTable = process.env.APP_CONFIG_TABLE;
const auditEventsTable = process.env.AUDIT_EVENTS_TABLE;
const completionIndex = process.env.COMPLETION_INDEX || 'RafflesByCompletionIndex';
const publicRafflesIndex = process.env.PUBLIC_RAFFLES_INDEX || 'PublicRafflesIndex';
const defaultDelayDays = 30;
const pageSize = 100;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function settingsDelayDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : defaultDelayDays;
}

async function getDelayDays(organizerSub, cache) {
  if (!organizerSub) return defaultDelayDays;
  if (cache.has(organizerSub)) return cache.get(organizerSub);
  const result = await dynamo.send(new GetCommand({
    TableName: appConfigTable,
    Key: { configKey: `ORGANIZER_SETTINGS#${organizerSub}` },
    ConsistentRead: true,
  }));
  const days = settingsDelayDays(result.Item?.completionDelayDays);
  cache.set(organizerSub, days);
  return days;
}

function epochForDraw(raffle) {
  const drawnAt = raffle.drawResult?.drawnAt || raffle.updatedAt || raffle.createdAt;
  const epoch = Math.floor(new Date(drawnAt || '').getTime() / 1000);
  return Number.isSafeInteger(epoch) && epoch > 0 ? epoch : Math.floor(Date.now() / 1000);
}

async function completeRaffle(raffle, now, nowEpoch) {
  const auditId = randomUUID();
  const completedAt = new Date(now).toISOString();
  await dynamo.send(new TransactWriteCommand({
    TransactItems: [
      {
        Update: {
          TableName: rafflesTable,
          Key: { raffleId: raffle.raffleId },
          UpdateExpression: 'SET #status = :completed, #featured = :false, #completedAt = :completedAt, #updatedAt = :completedAt REMOVE #publicStatus, #featuredStatus, #completionStatus, #completionAtEpoch',
          ConditionExpression: '#organizerSub = :organizerSub AND #status = :drawn AND #completionStatus = :pending AND #completionAtEpoch <= :nowEpoch',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#featured': 'featured',
            '#completedAt': 'completedAt',
            '#updatedAt': 'updatedAt',
            '#publicStatus': 'publicStatus',
            '#featuredStatus': 'featuredStatus',
            '#completionStatus': 'completionStatus',
            '#completionAtEpoch': 'completionAtEpoch',
            '#organizerSub': 'organizerSub',
          },
          ExpressionAttributeValues: {
            ':completed': 'COMPLETED',
            ':false': false,
            ':completedAt': completedAt,
            ':organizerSub': raffle.organizerSub,
            ':drawn': 'DRAWN',
            ':pending': 'PENDING',
            ':nowEpoch': nowEpoch,
          },
        },
      },
      {
        Put: {
          TableName: auditEventsTable,
          Item: {
            auditId,
            organizerSub: raffle.organizerSub,
            actor: 'Sistema',
            action: 'RAFFLE_COMPLETED',
            raffleId: raffle.raffleId,
            raffleTitle: raffle.title || '',
            occurredAt: completedAt,
            details: { drawnAt: raffle.drawResult?.drawnAt || '', completedByRule: true },
          },
          ConditionExpression: 'attribute_not_exists(auditId)',
        },
      },
    ],
  }));
}

async function scheduleLegacyDrawnRaffle(raffle, now, nowEpoch, cache) {
  const days = await getDelayDays(raffle.organizerSub, cache);
  const completionAtEpoch = epochForDraw(raffle) + days * 24 * 60 * 60;
  if (completionAtEpoch <= nowEpoch) {
    await dynamo.send(new UpdateCommand({
      TableName: rafflesTable,
      Key: { raffleId: raffle.raffleId },
      UpdateExpression: 'SET #completionStatus = :pending, #completionAtEpoch = :completionAtEpoch',
      ConditionExpression: '#status = :drawn AND attribute_not_exists(#completionAtEpoch)',
      ExpressionAttributeNames: {
        '#completionStatus': 'completionStatus',
        '#completionAtEpoch': 'completionAtEpoch',
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':pending': 'PENDING',
        ':completionAtEpoch': completionAtEpoch,
        ':drawn': 'DRAWN',
      },
    }));
    await completeRaffle({ ...raffle, completionStatus: 'PENDING', completionAtEpoch }, now, nowEpoch);
    return 'completed';
  }

  await dynamo.send(new UpdateCommand({
    TableName: rafflesTable,
    Key: { raffleId: raffle.raffleId },
    UpdateExpression: 'SET #completionStatus = :pending, #completionAtEpoch = :completionAtEpoch',
    ConditionExpression: '#status = :drawn AND attribute_not_exists(#completionAtEpoch)',
    ExpressionAttributeNames: {
      '#completionStatus': 'completionStatus',
      '#completionAtEpoch': 'completionAtEpoch',
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':pending': 'PENDING',
      ':completionAtEpoch': completionAtEpoch,
      ':drawn': 'DRAWN',
    },
  }));
  return 'scheduled';
}

async function queryIndex(indexName, partitionName, partitionValue, dueEpoch) {
  const items = [];
  let exclusiveStartKey;
  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: rafflesTable,
      IndexName: indexName,
      KeyConditionExpression: dueEpoch === undefined
        ? '#partition = :partition'
        : '#partition = :partition AND #completionAtEpoch <= :nowEpoch',
      ExpressionAttributeNames: {
        '#partition': partitionName,
        ...(dueEpoch === undefined ? {} : { '#completionAtEpoch': 'completionAtEpoch' }),
      },
      ExpressionAttributeValues: {
        ':partition': partitionValue,
        ...(dueEpoch === undefined ? {} : { ':nowEpoch': dueEpoch }),
      },
      Limit: pageSize,
      ExclusiveStartKey: exclusiveStartKey,
    }));
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

export const handler = async () => {
  if (!rafflesTable || !appConfigTable || !auditEventsTable) {
    throw new Error('Missing raffle completion configuration.');
  }
  const nowEpoch = Math.floor(Date.now() / 1000);
  const now = new Date(nowEpoch * 1000).toISOString();
  const settingsCache = new Map();
  const dueRaffles = await queryIndex(completionIndex, 'completionStatus', 'PENDING', nowEpoch);
  const dueIds = new Set(dueRaffles.map((raffle) => raffle.raffleId));
  let completed = 0;
  for (const raffle of dueRaffles) {
    try {
      await completeRaffle(raffle, now, nowEpoch);
      completed += 1;
    } catch (error) {
      if (error?.name !== 'TransactionCanceledException' && error?.name !== 'TransactionConflictException') throw error;
    }
  }

  const publicDrawnRaffles = await queryIndex(publicRafflesIndex, 'publicStatus', 'DRAWN');
  let scheduled = 0;
  for (const raffle of publicDrawnRaffles) {
    if (raffle.status !== 'DRAWN' || raffle.publicStatus !== 'DRAWN'
      || typeof raffle.organizerSub !== 'string' || !raffle.organizerSub
      || dueIds.has(raffle.raffleId) || raffle.completionAtEpoch !== undefined) continue;
    try {
      const outcome = await scheduleLegacyDrawnRaffle(raffle, now, nowEpoch, settingsCache);
      if (outcome === 'scheduled') scheduled += 1;
      else if (outcome === 'completed') completed += 1;
    } catch (error) {
      if (error?.name !== 'ConditionalCheckFailedException'
        && error?.name !== 'TransactionCanceledException'
        && error?.name !== 'TransactionConflictException') throw error;
    }
  }

  console.info('Drawn raffle lifecycle processed.', { due: dueRaffles.length, completed, scheduled });
  return { due: dueRaffles.length, completed, scheduled };
};
