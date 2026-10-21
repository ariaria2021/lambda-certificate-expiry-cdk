// Run real CDK synthesis against an isolated copy; never replace the source certificates.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = mkdtempSync(path.join(tmpdir(), 'certificate-synth-'));
const lab = 'labs/03-app-store-server-certificate-guard';
const environment = { ...process.env, AWS_EC2_METADATA_DISABLED: 'true' };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: fixture,
    env: environment,
    encoding: 'utf8',
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function synth(outputDirectory) {
  return run(process.execPath, [
    path.join(projectRoot, 'node_modules/aws-cdk/bin/cdk'),
    'synth', 'AppStoreServerCertificateGuardStack', '--quiet', '--output', outputDirectory,
  ]);
}

try {
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'cdk.json', 'bin', 'lib', 'labs']) {
    cpSync(path.join(projectRoot, name), path.join(fixture, name), { recursive: true });
  }
  symlinkSync(path.join(projectRoot, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');

  const validOutput = path.join(fixture, 'valid.out');
  console.log('Scenario: original Apple Root CA certificates / threshold 900 days');
  const valid = synth(validOutput);
  assert.equal(valid.status, 0, valid.output);
  assert.equal(valid.output.match(/^Certificate will not expire$/gm)?.length, 3, valid.output);
  process.stdout.write(`${valid.output.split('\n').filter((line) => line.startsWith('Certificate ')).join('\n')}\n`);
  console.log('Result: cdk synth exit status 0; all three certificates passed.');

  const assetName = readdirSync(validOutput).find((name) =>
    name.startsWith('asset.') && existsSync(path.join(validOutput, name, 'certificates')),
  );
  assert.ok(assetName, 'Synthesized Lambda asset was not found.');
  const asset = path.join(validOutput, assetName);
  for (const name of ['apple-inc-root.cer', 'apple-root-ca-g2.cer', 'apple-root-ca-g3.cer']) {
    assert.deepEqual(
      readFileSync(path.join(asset, 'certificates', name)),
      readFileSync(path.join(fixture, lab, 'lambda/certificates', name)),
    );
  }

  // Import the actual esbuild output, not the unbundled handler source.
  const bundled = await import(pathToFileURL(path.join(asset, 'index.mjs')).href);
  assert.ok(bundled.createSignedDataVerifier({ bundleId: 'com.example.app' }));
  assert.ok(bundled.createSignedDataVerifier({
    bundleId: 'com.example.app', environment: 'Production', appAppleId: 123456789,
  }));
  assert.throws(() => bundled.createSignedDataVerifier({
    bundleId: 'com.example.app', environment: 'Production',
  }), /appAppleId is required/);
  assert.equal((await bundled.handler({})).statusCode, 400);
  await assert.rejects(bundled.handler({ signedTransaction: 'invalid-jws' }), (error) =>
    error instanceof Error && typeof error.status === 'number',
  );
  console.log('Result: bundled ESM loads; verifier initializes; malformed JWS is rejected.');
  console.log('Scope: no real Apple-signed transaction or deployed AWS Lambda was tested.');

  const shortCertificate = path.join(fixture, lab, 'lambda/certificates/apple-root-ca-g3.cer');
  const generated = run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=Short-lived test certificate', '-outform', 'DER',
    '-keyout', path.join(fixture, 'test-only-private-key.pem'), '-out', shortCertificate,
  ]);
  assert.equal(generated.status, 0, generated.output);
  const parsed = run('openssl', ['x509', '-inform', 'DER', '-in', shortCertificate, '-noout', '-subject', '-enddate']);
  assert.equal(parsed.status, 0, parsed.output);

  console.log('\nScenario: one-day DER test certificate / threshold 900 days');
  process.stdout.write(parsed.output);
  const short = synth(path.join(fixture, 'short.out'));
  assert.equal(short.status, 1, short.output);
  assert.match(short.output, /Certificate will expire/);
  assert.doesNotMatch(short.output, /Unable to load certificate|Could not read certificate/);
  process.stdout.write(`${short.output.split('\n').filter((line) => line.startsWith('Certificate ')).join('\n')}\n`);
  console.log('Result: cdk synth exit status 1 due to certificate expiry threshold.');
  console.log('Original project certificates were never modified.');
  console.log('CDK synth integration tests passed.');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
