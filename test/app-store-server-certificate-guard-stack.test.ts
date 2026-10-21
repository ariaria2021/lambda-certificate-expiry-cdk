import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  AppStoreServerCertificateGuardStack,
  minimumCertificateValidityDays,
} from '../lib/app-store-server-certificate-guard-stack';

describe('AppStoreServerCertificateGuardStack', () => {
  const app = new cdk.App();
  const stack = new AppStoreServerCertificateGuardStack(app, 'TestAppStoreServerCertificateGuardStack');
  const template = Template.fromStack(stack);

  it('keeps the 900-day sample guard in reviewed source', () => {
    expect(minimumCertificateValidityDays).toBe(900);
  });

  it('creates an ESM Node.js 24 Lambda for signed transaction verification', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Handler: 'index.handler',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: {
          APP_BUNDLE_ID: 'com.example.app',
          APP_STORE_ENVIRONMENT: 'Sandbox',
        },
      },
    });
  });
});
