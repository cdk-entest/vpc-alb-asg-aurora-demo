#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import {
  ApplicationLoadBalancerStack,
  AuroraDbStack,
  RoleForEc2,
  VpcAlbAuroraStack,
  WebServerStack,
} from "../lib/vpc-alb-aurora-stack-v1";

// parameters
const REGION = "ap-southeast-1";

const app = new cdk.App();

// vpc and endpoints
const network = new VpcAlbAuroraStack(app, "VpcStackAuroraDemo", {
  cidr: "10.0.0.0/16",
  vpcName: "VpcStackAuroraDemo",
  env: {
    region: REGION,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

// role for ec2 webserver 
const role = new RoleForEc2(app, "RoleForWebServerAurora", {
  env: {
    region: REGION, 
    account: process.env.CDK_DEFAULT_ACCOUNT
  }
})

// aurora cluster database 
const aurora = new AuroraDbStack(app, "AuroraStack", {
  vpc: network.vpc, 
  dbSG: network.databaseSG, 
  dbName: "covid", 
  env: {
    region: REGION, 
    account: process.env.CDK_DEFAULT_ACCOUNT
  }
})

// webserver 
const server = new WebServerStack(app, "WebServerAurora", {
  vpc: network.vpc, 
  sg: network.webServerSG, 
  role: role.role, 
  env: {
    region: REGION, 
    account: process.env.CDK_DEFAULT_ACCOUNT
  }
})

// load balancer 
const alb = new ApplicationLoadBalancerStack(app, "ApplicationStack", {
  vpc: network.vpc, 
  asgRole: role.asgRole, 
  albSG: network.albSG, 
  asgSG: network.asgSG, 
  env: {
    region: REGION, 
    account: process.env.CDK_DEFAULT_ACCOUNT
  }
})

// dependencies 
server.addDependency(role)
alb.addDependency(aurora)
alb.addDependency(role)
