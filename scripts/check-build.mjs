import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    result.push(...(entry.isDirectory() ? await files(path) : [path]));
  }
  return result;
}
for (const file of await files('dist')) {
  const text = await readFile(file, 'utf8');
  if (/postgres(?:ql)?:\/\/|sb_secret_|service_role|MUKMUK_DATABASE_URL|DISCORD_BOT_TOKEN|SCRAM-SHA-256\$/.test(text)) {
    throw new Error(`Server configuration detected in ${file}`);
  }
}
console.log('Static build contains public configuration only.');
