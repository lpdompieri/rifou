import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

const rafflesTable = process.env.RAFFLES_TABLE;
const numbersTable = process.env.RAFFLE_NUMBERS_TABLE;
const transactionsTable = process.env.RAFFLE_TRANSACTIONS_TABLE;
const participantLimitsTable = process.env.PARTICIPANT_LIMITS_TABLE;
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const PENDING_ORDERS_INDEX = process.env.PENDING_ORDERS_INDEX || 'PendingPixOrdersByExpiryIndex';
const MAX_NUMBERS_PER_ORDER = 98;
const PAGE_SIZE = 20;

export const handler = async (event) => {
  if (!rafflesTable || !numbersTable || !transactionsTable || !participantLimitsTable) {
    throw new Error('Missing table environment variables for Pix order expiration.');
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const nowIso = new Date(nowEpoch * 1000).toISOString();
  const expiredOrders = await dynamo.send(new QueryCommand({
    TableName: transactionsTable,
    IndexName: PENDING_ORDERS_INDEX,
    KeyConditionExpression: '#pendingStatus = :pending AND #expiresAtEpoch <= :nowEpoch',
    ExpressionAttributeNames: {
      '#pendingStatus': 'pendingStatus',
      '#expiresAtEpoch': 'expiresAtEpoch',
    },
    ExpressionAttributeValues: {
      ':pending': 'PENDING',
      ':nowEpoch': nowEpoch,
    },
    ScanIndexForward: true,
    Limit: PAGE_SIZE,
  }));

  let expired = 0;
  let conflicts = 0;
  for (const candidate of expiredOrders.Items || []) {
    if (typeof candidate.transactionId !== 'string') {
      console.error('Skipping expired Pix index entry without transaction ID.');
      continue;
    }
    const orderResult = await dynamo.send(new GetCommand({
      TableName: transactionsTable,
      Key: { transactionId: candidate.transactionId },
      ConsistentRead: true,
    }));
    const order = orderResult.Item;
    if (!order || order.status !== 'PENDING' || Number(order.expiresAtEpoch) > nowEpoch) continue;
    if (!Array.isArray(order.numbers) || order.numbers.length < 1
      || order.numbers.length > MAX_NUMBERS_PER_ORDER) {
      console.error('Skipping malformed expired Pix order.', { transactionId: order.transactionId });
      continue;
    }

    const numberUpdates = order.numbers.map((number) => ({
      Update: {
        TableName: numbersTable,
        Key: { raffleId: order.raffleId, number },
        UpdateExpression: 'SET #status = :available REMOVE reservationId, reservedUntil, reservedUntilEpoch',
        ConditionExpression: '#status = :reserved AND reservationId = :transactionId',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':available': 'AVAILABLE',
          ':reserved': 'RESERVED',
          ':transactionId': order.transactionId,
        },
      },
    }));
    const participantLimitUpdate = order.participantCountTracked === true
      && typeof order.participantId === 'string'
      ? [{
        Update: {
          TableName: participantLimitsTable,
          Key: { raffleId: order.raffleId, participantId: order.participantId },
          UpdateExpression: 'SET #activeNumbers = #activeNumbers - :quantity',
          ConditionExpression: '#activeNumbers >= :quantity',
          ExpressionAttributeNames: { '#activeNumbers': 'activeNumbers' },
          ExpressionAttributeValues: { ':quantity': order.numbers.length },
        },
      }]
      : [];

    try {
      await dynamo.send(new TransactWriteCommand({
        ClientRequestToken: order.transactionId,
        TransactItems: [
          ...numberUpdates,
          ...participantLimitUpdate,
          {
            Update: {
              TableName: rafflesTable,
              Key: { raffleId: order.raffleId },
              UpdateExpression: 'SET #financialsLocked = :locked, #historyChecked = :checked, reservedCount = reservedCount - :quantity',
              ConditionExpression: 'reservedCount >= :positiveQuantity',
              ExpressionAttributeNames: { '#financialsLocked': 'financialsLocked', '#historyChecked': 'financialsHistoryChecked' },
              ExpressionAttributeValues: {
                ':locked': true,
                ':checked': true,
                ':quantity': order.numbers.length,
                ':positiveQuantity': order.numbers.length,
              },
            },
          },
          {
            Update: {
              TableName: transactionsTable,
              Key: { transactionId: order.transactionId },
              UpdateExpression: 'SET #status = :expired, expiredAt = :expiredAt REMOVE pendingStatus',
              ConditionExpression: '#status = :pending AND expiresAtEpoch <= :nowEpoch',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':expired': 'EXPIRED',
                ':pending': 'PENDING',
                ':expiredAt': nowIso,
                ':nowEpoch': nowEpoch,
              },
            },
          },
        ],
      }));
      expired += 1;
    } catch (error) {
      if (error?.name === 'TransactionCanceledException' || error?.name === 'TransactionConflictException') {
        conflicts += 1;
        console.info('Skipped Pix order expiration because its state changed.', {
          transactionId: order.transactionId,
          requestId: event?.id,
        });
        continue;
      }
      throw error;
    }
  }

  console.info('Processed expired fake Pix orders.', {
    found: expiredOrders.Items?.length || 0,
    expired,
    conflicts,
    requestId: event?.id,
  });
  return { found: expiredOrders.Items?.length || 0, expired, conflicts };
};
