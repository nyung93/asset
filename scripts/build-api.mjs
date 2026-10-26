import {build} from 'esbuild';

await build({
  entryPoints:['server/vercelEntry.ts'],
  outfile:'api/index.mjs',
  bundle:true,
  platform:'node',
  format:'esm',
  target:'node22',
  external:['pg'],
  logLevel:'info',
});
