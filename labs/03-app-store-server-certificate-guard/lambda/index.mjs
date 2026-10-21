import { SignedDataVerifier, Environment } from '@apple/app-store-server-library';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const certificateNames = [
  'apple-inc-root.cer',
  'apple-root-ca-g2.cer',
  'apple-root-ca-g3.cer',
];

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export function createSignedDataVerifier({
  bundleId,
  environment = Environment.SANDBOX,
  appAppleId,
  enableOnlineChecks = true,
  certificateDirectory = path.join(moduleDirectory, 'certificates'),
}) {
  if (![Environment.SANDBOX, Environment.PRODUCTION].includes(environment)) {
    throw new Error('APP_STORE_ENVIRONMENT must be Sandbox or Production.');
  }
  const appleRootCertificates = certificateNames.map((certificateName) =>
    readFileSync(path.join(certificateDirectory, certificateName)),
  );

  return new SignedDataVerifier(
    appleRootCertificates,
    enableOnlineChecks,
    environment,
    bundleId,
    appAppleId,
  );
}

export async function handler(event) {
  const signedTransaction = event?.signedTransaction;
  if (typeof signedTransaction !== 'string' || signedTransaction.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'signedTransaction is required.' }),
    };
  }

  const verifier = createSignedDataVerifier({
    bundleId: process.env.APP_BUNDLE_ID ?? 'com.example.app',
    environment: process.env.APP_STORE_ENVIRONMENT ?? Environment.SANDBOX,
    appAppleId: process.env.APP_APPLE_ID ? Number(process.env.APP_APPLE_ID) : undefined,
  });
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);

  return {
    statusCode: 200,
    body: JSON.stringify(transaction),
  };
}
