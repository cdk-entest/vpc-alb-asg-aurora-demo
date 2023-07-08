#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import {
  ApplicationLoadBalancerStack,
  AuroraDbStack,
  VpcAlbAuroraStack,
} from "../lib/vpc-alb-aurora-stack-v1";

// parameters
const REGION = "ap-southeast-1";

const app = new cdk.App();

// vpc and endpoints
const vpc = new VpcAlbAuroraStack(app, "VpcStackAuroraDemo", {
  cidr: "10.0.0.0/16",
  vpcName: "VpcStackAuroraDemo",
  env: {
    region: REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// aurora and a public ec2
const aurora = new AuroraDbStack(app, "AuroraDbStack", {
  dbName: "AuroraDbDemo",
  publicEc2Name: "PublicInstance",
  vpc: vpc.vpc,
  env: {
    region: REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

aurora.addDependency(vpc);

// application load balancer
const alb = new ApplicationLoadBalancerStack(
  app,
  "ApplicationLoadBalancerStack",
  {
    vpc: vpc.vpc,
    env: {
      region: REGION,
      account: process.env.CDK_DEFAULT_ACCOUNT,
    },
  }
);

alb.addDependency(aurora);
