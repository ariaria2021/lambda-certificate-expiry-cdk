#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AppStoreServerCertificateGuardStack } from '../lib/app-store-server-certificate-guard-stack';

const app = new cdk.App();

new AppStoreServerCertificateGuardStack(app, 'AppStoreServerCertificateGuardStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '000000000000',
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
