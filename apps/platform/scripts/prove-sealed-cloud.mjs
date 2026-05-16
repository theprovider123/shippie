#!/usr/bin/env bun

const opts = parseArgs(process.argv.slice(2));
const started = performance.now();

async function main() {
  console.log(`Proving Shippie sealed cloud at ${opts.origin}`);
  await run('smoke', ['bun', 'scripts/check-sealed-cloud.mjs', opts.origin]);

  if (opts.handover) {
    await run('device-handover', [
      'bun',
      'scripts/prove-device-handover.mjs',
      '--origin',
      opts.origin,
      '--profiles',
      'ios-safari,android-chrome',
    ]);
  }

  for (const profile of opts.profiles) {
    await run(`benchmark:${profile}`, [
      'bun',
      'scripts/bench-sealed-cloud.mjs',
      '--origin',
      opts.origin,
      '--profile',
      profile,
      '--fail-on-target-miss',
    ]);
  }

  if (opts.torture) {
    await run('torture', [
      'bun',
      'scripts/torture-sealed-cloud.mjs',
      '--origin',
      opts.origin,
      '--media',
      opts.media.join(','),
    ]);
  }

  console.log(`\nSealed cloud proof passed in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
}

async function run(label, cmd) {
  console.log(`\n== ${label} ==`);
  const proc = Bun.spawn(cmd, {
    cwd: new URL('..', import.meta.url).pathname,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}`);
}

function parseArgs(args) {
  const opts = {
    origin: process.env.SHIPPIE_SEALED_CLOUD_ORIGIN ?? 'https://shippie.app',
    profiles: ['quick'],
    torture: false,
    handover: true,
    media: [1024 * 1024],
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--origin') opts.origin = args[++i] ?? opts.origin;
    else if (arg === '--profiles') {
      opts.profiles = String(args[++i] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === '--torture') {
      opts.torture = true;
    } else if (arg === '--skip-handover') {
      opts.handover = false;
    } else if (arg === '--media') {
      opts.media = String(args[++i] ?? '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
  }
  if (opts.profiles.length === 0) opts.profiles = ['quick'];
  if (opts.media.length === 0) opts.media = [1024 * 1024];
  return opts;
}

main().catch((err) => {
  console.error('\nSealed cloud proof failed:');
  console.error(err);
  process.exit(1);
});
