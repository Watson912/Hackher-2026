// Runs a .sql file against the database in api/.env (multiple statements).
// Usage: npx tsx scripts/run-sql.ts ../database/healthher_04_migrate_session_ratings.sql
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

const file = process.argv[2];
if (!file) throw new Error('Pass a .sql file');

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'herbalance',
  multipleStatements: true,
});
try {
  await conn.query(await readFile(file, 'utf8'));
  console.log(`Ran ${file}`);
} finally {
  await conn.end();
}
