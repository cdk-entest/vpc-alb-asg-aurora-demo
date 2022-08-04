#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import {
  ApplicationLoadBalancerStack,
  AuroraDbStack,
  VpcAlbAuroraStack,
} from "../lib/vpc-alb-aurora-stack";

// parameters
const REGION = "us-east-1";

const app = new cdk.App();

// vpc and endpoints
const vpc = new VpcAlbAuroraStack(app, "VpcStackDemo", {
  cidir: "10.0.0.0/20",
  vpcName: "VpcStackDemo",
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
