import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import path from 'node:path';

// This value is intentionally tracked in source. Change it through review to
// match the longest interval in which this Lambda is guaranteed to be maintained.
export const minimumCertificateValidityDays = 900;

const certificateNames = [
  'apple-inc-root.cer',
  'apple-root-ca-g2.cer',
  'apple-root-ca-g3.cer',
];
const certificateRelativeDirectory = 'labs/03-app-store-server-certificate-guard/lambda/certificates';
const shellQuote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

export class AppStoreServerCertificateGuardStack extends cdk.Stack {
  public readonly verifier: lambdaNodejs.NodejsFunction;

  public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const logGroup = new logs.LogGroup(this, 'VerifierLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.verifier = new lambdaNodejs.NodejsFunction(this, 'SignedTransactionVerifier', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../labs/03-app-store-server-certificate-guard/lambda/index.mjs'),
      handler: 'handler',
      bundling: {
        format: lambdaNodejs.OutputFormat.ESM,
        // CommonJS dependencies bundled into ESM still require Node built-ins.
        banner: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
        externalModules: [],
        commandHooks: {
          beforeBundling: (inputDir) => certificateNames.map((name) =>
            `openssl x509 -inform DER -in ${shellQuote(path.join(inputDir, certificateRelativeDirectory, name))} -checkend ${minimumCertificateValidityDays * 24 * 60 * 60} -noout`,
          ),
          beforeInstall: () => [],
          afterBundling: (inputDir, outputDir) => [
            `mkdir -p ${shellQuote(path.join(outputDir, 'certificates'))}`,
            ...certificateNames.map((name) =>
              `cp ${shellQuote(path.join(inputDir, certificateRelativeDirectory, name))} ${shellQuote(path.join(outputDir, 'certificates', name))}`,
            ),
          ],
        },
      },
      environment: {
        APP_BUNDLE_ID: 'com.example.app',
        APP_STORE_ENVIRONMENT: 'Sandbox',
      },
      tracing: lambda.Tracing.ACTIVE,
      timeout: cdk.Duration.seconds(10),
      logGroup,
    });

  }
}
