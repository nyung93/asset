import {database,ensureSchema} from '../server/db';
import {normalizeUsername,usernameLookup} from '../server/security';

const username=process.argv[2];
if(!username) {process.stderr.write('Usage: npm run admin:grant -- <username>\n');process.exit(1);}
try {
  await ensureSchema();
  const lookup=usernameLookup(normalizeUsername(username));
  const result=await database().query('UPDATE users SET role=$1 WHERE username_lookup=$2 RETURNING id,name',['ADMIN',lookup]);
  if(!result.rowCount) throw new Error('No registered account matches that username.');
  process.stdout.write(`Admin access granted to ${result.rows[0].name}.\n`);
} catch(error) {
  process.stderr.write(`${error instanceof Error?error.message:'Failed to grant admin access.'}\n`);
  process.exitCode=1;
} finally {if(process.env.DATABASE_URL) await database().end().catch(()=>undefined);}
