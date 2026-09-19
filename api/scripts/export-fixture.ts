// Exports Maya's seeded sessions to src/core/fixtures/maya-sessions.json, so
// the learning tests run on exactly what the database holds.
// Run after re-seeding: npx tsx scripts/export-fixture.ts
import { writeFile } from 'node:fs/promises';
import { pool } from '../src/db.ts';
import { demoUserId, loadUser, localToday } from '../src/users.ts';

const ctx = await loadUser(await demoUserId());
const out = new URL('../src/core/fixtures/maya-sessions.json', import.meta.url);
await writeFile(out, JSON.stringify({ exportedOn: localToday(), sessions: ctx.sessions }, null, 1) + '\n');
console.log(`Wrote ${ctx.sessions.length} sessions`);
await pool.end();
