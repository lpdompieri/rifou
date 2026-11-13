import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const seedFile = resolve(scriptDirectory, '../data/raffles.seed.json');
const tableNameIndex = process.argv.indexOf('--table-name');
const tableName = tableNameIndex >= 0 ? process.argv[tableNameIndex + 1] : undefined;
const numbersTableNameIndex = process.argv.indexOf('--numbers-table-name');
const numbersTableName = numbersTableNameIndex >= 0 ? process.argv[numbersTableNameIndex + 1] : undefined;

if (!tableName || !numbersTableName) {
  console.error('Uso: node scripts/seed-raffles.mjs --table-name <tabela-rifas> --numbers-table-name <tabela-numeros>');
  process.exitCode = 1;
} else {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient(region ? { region } : {}));
  const seedItems = JSON.parse(await readFile(seedFile, 'utf8'));
  let inserted = 0;
  let skipped = 0;
  let numbersInserted = 0;
  let numbersSkipped = 0;

  for (const item of seedItems) {
    try {
      await documentClient.send(new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(raffleId)',
      }));
      inserted += 1;
      console.log(`Inserida: ${item.raffleId}`);
    } catch (error) {
      if (error?.name === 'ConditionalCheckFailedException') {
        skipped += 1;
        console.log(`Já existe, mantida sem alterações: ${item.raffleId}`);
        continue;
      }
      throw error;
    }
  }

  const numberTasks = [];
  for (const raffle of seedItems) {
    const total = Number(raffle.numberCount);
    const reservedCount = Number(raffle.reservedCount || 0);
    const confirmedCount = Number(raffle.confirmedCount || 0);
    if (!Number.isSafeInteger(total) || total < 1 || reservedCount + confirmedCount > total) {
      throw new Error(`Contagens inválidas para a rifa ${raffle.raffleId}.`);
    }

    const order = Array.from({ length: total }, (_, index) => index + 1);
    let randomSeed = [...raffle.raffleId].reduce((value, letter) => value + letter.charCodeAt(0), 17);
    for (let index = order.length - 1; index > 0; index -= 1) {
      randomSeed = (randomSeed * 48271) % 2147483647;
      const swapIndex = randomSeed % (index + 1);
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }

    const statusByNumber = new Map();
    order.slice(0, reservedCount).forEach((number) => statusByNumber.set(number, 'RESERVED'));
    order.slice(reservedCount, reservedCount + confirmedCount)
      .forEach((number) => statusByNumber.set(number, 'CONFIRMED'));
    for (let number = 1; number <= total; number += 1) {
      numberTasks.push({ raffleId: raffle.raffleId, number, status: statusByNumber.get(number) || 'AVAILABLE' });
    }
  }

  let nextTask = 0;
  const seedNumberWorker = async () => {
    while (nextTask < numberTasks.length) {
      const numberItem = numberTasks[nextTask];
      nextTask += 1;
      try {
        await documentClient.send(new PutCommand({
          TableName: numbersTableName,
          Item: numberItem,
          ConditionExpression: 'attribute_not_exists(raffleId)',
        }));
        numbersInserted += 1;
      } catch (error) {
        if (error?.name === 'ConditionalCheckFailedException') {
          numbersSkipped += 1;
          continue;
        }
        throw error;
      }
    }
  };

  await Promise.all(Array.from({ length: 5 }, () => seedNumberWorker()));
  console.log(`Seed concluído. Rifas inseridas: ${inserted}; rifas mantidas: ${skipped}; números inseridos: ${numbersInserted}; números já existentes mantidos: ${numbersSkipped}.`);
}
