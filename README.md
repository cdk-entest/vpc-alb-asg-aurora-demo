---
title: Chakra UI Hackathon 22’ Recap
description:
  Last month we had the first-ever Chakra UI Hackathon, which we tagged the
  Chakrathon 22'. The Hackathon was held from May 3rd to May 20th, 2022, with
  participants from various parts of the world involved.
author: estheragbaje
publishedDate: 06/23/2022
date: 2022-07-24
---

## Introduction

- Load balancer and auto scaling group
- Aurora multiple AZ
- Autoscaling stratergy (not yet here )
- [Aurora multi AZ](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.html)
- [Aurora multi master](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds.CfnDBCluster.html#enginemode)

## Architectrure

![aws_devops-ica drawio](https://user-images.githubusercontent.com/20411077/170316806-737ff153-23df-456c-bee4-2812ab5e1b8a.png)

## VPC Stack

create a new vpc

```tsx
const vpc = new aws_ec2.Vpc(this, "VpcForAuroraDemo", {
  vpcName: props.vpcName,
  cidr: props.cidir,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  subnetConfiguration: [
    {
      cidrMask: 24,
      name: "PublicSubnet",
      subnetType: aws_ec2.SubnetType.PUBLIC,
    },
    {
      cidrMask: 24,
      name: "PrivateSubnet",
      subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
    },
    {
      cidrMask: 24,
      name: "PrivateSubnetWithNat",
      subnetType: aws_ec2.SubnetType.PRIVATE_WITH_NAT,
    },
  ],
});
```

## Aurora Cluster Stack

security group for aurora

```tsx
const sg = new aws_ec2.SecurityGroup(this, "SecurityGroupForSsmEndpoint", {
  vpc,
  description: "Allow port 443 from private instance",
  allowAllOutbound: true,
});

sg.addIngressRule(
  aws_ec2.Peer.anyIpv4(),
  aws_ec2.Port.tcp(3306),
  "allow HTTPS from private ec2 "
);
```

aurora cluster: single AZ, single master (write/read). There are advanced options for high performance [multi-master](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-multi-master.html) and [multi-az](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.html)

```tsx
const cluster = new aws_rds.DatabaseCluster(this, "IcaDatabase", {
  removalPolicy: RemovalPolicy.DESTROY,
  defaultDatabaseName: props.dbName,
  engine: aws_rds.DatabaseClusterEngine.auroraMysql({
    version: aws_rds.AuroraMysqlEngineVersion.VER_2_08_1,
  }),
  credentials: aws_rds.Credentials.fromGeneratedSecret("admin"),
  instanceProps: {
    instanceType: aws_ec2.InstanceType.of(
      aws_ec2.InstanceClass.BURSTABLE2,
      aws_ec2.InstanceSize.SMALL
    ),
    vpcSubnets: {
      subnetType: aws_ec2.SubnetType.PUBLIC,
    },
    vpc,
    securityGroups: [sg],
  },
  deletionProtection: false,
  instances: 2,
});
```

## Application load balancer stack

role for EC2 to download from S3, access SSM, and Secret Mangement

```tsx
const role = new aws_iam.Role(this, `RoleForEc2AsgToAccessSSM`, {
  roleName: `RoleForEc2AsgToAccessSSM-${this.region}`,
  assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
});
```

add policy for s3 to download userData-web and read db credentials from secrete maanger

```tsx
role.attachInlinePolicy(
  new aws_iam.Policy(this, `PolicyForEc2AsgToReadS3`, {
    policyName: `PolicyForEc2AsgToReadS3-${this.region}`,
    statements: [
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: ["arn:aws:s3:::haimtran-workspace/*"],
      }),
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ["secretsmanager:*"],
        resources: ["*"],
      }),
    ],
  })
);
```

policy for system manager connection

```tsx
role.addManagedPolicy(
  aws_iam.ManagedPolicy.fromManagedPolicyArn(
    this,
    `PolicyForEc2AsgToAccessSSM-${this.region}`,
    "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  )
);
```

auto scaling group

```tsx
const asg = new aws_autoscaling.AutoScalingGroup(this, "ASG", {
  vpc,
  instanceType: aws_ec2.InstanceType.of(
    aws_ec2.InstanceClass.T2,
    aws_ec2.InstanceSize.SMALL
  ),
  machineImage: new aws_ec2.AmazonLinuxImage({
    generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
    edition: aws_ec2.AmazonLinuxEdition.STANDARD,
  }),
  minCapacity: 2,
  maxCapacity: 3,
  role: role,
  vpcSubnets: {
    subnets: [
      aws_ec2.Subnet.fromSubnetId(
        this,
        "PrivateSubnetWithNat1",
        privateSubnetIds[2]
      ),
      aws_ec2.Subnet.fromSubnetId(
        this,
        "PrivateSubnetWithNat2",
        privateSubnetIds[3]
      ),
    ],
  },
});
asg.addUserData(fs.readFileSync("./lib/script/user-data.sh", "utf8"));
```

application load balancer

```tsx
const alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(
  this,
  "ALB",
  {
    vpc,
    internetFacing: true,
  }
);
```

listen port 80

```tsx
const listener = alb.addListener("Listener", {
  port: 80,
});

listener.addTargets("Target", {
  port: 80,
  targets: [asg],
});

listener.connections.allowDefaultPortFromAnyIpv4("Open to the world");

asg.scaleOnRequestCount("AmodestLoad", {
  targetRequestsPerMinute: 60,
});
```

## UserData

```shell
#!/bin/bash
cd ~
mkdir web
cd web
aws s3 cp s3://haimtran-workspace/aurora-web.zip .
unzip aurora-web.zip
sudo python3 -m pip install -r requirements.txt
sudo python3 app.py
```

## Mysql connector python

get DB credentials from secret management

```python
# sm client
secrete_client = boto3.client('secretsmanager',
                                region_name=REGION)

# get secret string
secret = secrete_client.get_secret_value(
    SecretId=SECRET_ID
)
```

connector

```python
conn = mysql.connector.connect(
    host=secret_dic['host'],
    user=secret_dic['username'],
    port=secret_dic['port'],
    password=secret_dic['password'],
    database=secret_dic['dbname']
)
```

create table

```python
# cursor
    cur = conn.cursor()
    # drop table if exists
    drop = "DROP TABLE IF EXISTS employees"
    cur.execute(drop)
    # create table
    employee_table = (
        "CREATE TABLE employees ("
        "    id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT, "
        "    name VARCHAR(30) DEFAULT '' NOT NULL, "
        "    age TEXT, "
        "    time TEXT, "
        "PRIMARY KEY (id))"
    )
    cur.execute(employee_table)
```

query table

```python
stmt_select = "SELECT id, name, age, time FROM employees ORDER BY id"
    cur.execute(stmt_select)
    # parse
    for row in cur.fetchall():
        print(row)
```
