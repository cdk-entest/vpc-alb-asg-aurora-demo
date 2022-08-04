import {
  Stack,
  StackProps,
  aws_ec2,
  aws_rds,
  RemovalPolicy,
  aws_iam,
  aws_elasticloadbalancingv2,
  aws_autoscaling,
  CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";

interface VpcAlbAuroraStackProps extends StackProps {
  vpcName: string;
  cidir: string;
}

export class VpcAlbAuroraStack extends Stack {
  public readonly vpc: aws_ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcAlbAuroraStackProps) {
    super(scope, id, props);

    // create a new vpc
    const vpc = new aws_ec2.Vpc(this, "VpcWithoutNat", {
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

    // add s3 interface endpoint
    vpc.addGatewayEndpoint("S3VpcEndpoint", {
      service: aws_ec2.GatewayVpcEndpointAwsService.S3,
    });

    // add vpc endpoint ssm
    vpc.addInterfaceEndpoint("VpcInterfaceEndpointSSM", {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
    });

    // output
    this.vpc = vpc;
  }
}

interface AuroraDbStackProps extends StackProps {
  vpc: aws_ec2.Vpc;
  dbName: string;
  publicEc2Name: string;
}

export class AuroraDbStack extends Stack {
  constructor(scope: Construct, id: string, props: AuroraDbStackProps) {
    super(scope, id, props);

    const vpc = props.vpc;

    // db security group
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

    // aurora cluster
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
      instances: 1,
    });

    // security group for ec2 in public subnet
    const sgEc2WebApp = new aws_ec2.SecurityGroup(
      this,
      "SecurityGroupForWebAppInPublicSubnet",
      {
        securityGroupName: "SecurityGroupForWebAppInPublicSubnet",
        vpc,
        description: "allo communication with ssm",
        allowAllOutbound: true,
      }
    );

    sgEc2WebApp.addIngressRule(
      aws_ec2.Peer.anyIpv4(),
      aws_ec2.Port.tcp(80),
      "allow HTTP from private ec2 "
    );

    // role for ec2
    const role = new aws_iam.Role(this, "RoleForEc2ToAccessSsm", {
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
      roleName: "RoleForEc2ToAccessSsm",
    });

    // download some web data from s3
    role.attachInlinePolicy(
      new aws_iam.Policy(this, "PolicyForEc2AsgToReadS3", {
        policyName: "PolicyForEc2AsgToReadS3",
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["s3:*"],
            resources: [
              "arn:aws:s3:::haimtran-workspace/*",
              "arn:aws:s3:::haimtran-workspace",
            ],
          }),
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["secretsmanager:*"],
            resources: ["*"],
          }),
        ],
      })
    );

    // AmazonSSMManagedInstanceCore to communicate with SSM
    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        "PolicySSMMangerAccessS3",
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
      )
    );

    // public subnet ec2
    const publicEc2 = new aws_ec2.Instance(this, "Ec2PublicSubnetSsmAndS3", {
      vpc: vpc,
      role: role,
      instanceName: props.publicEc2Name,
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T3,
        aws_ec2.InstanceSize.MICRO
      ),
      machineImage: new aws_ec2.AmazonLinuxImage({
        generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: aws_ec2.AmazonLinuxEdition.STANDARD,
      }),
      securityGroup: sgEc2WebApp,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PUBLIC,
      },
      allowAllOutbound: true,
    });

    // user data
    publicEc2.addUserData(fs.readFileSync("./lib/script/user-data.sh", "utf8"));

    // output
    new CfnOutput(this, "DbCredentialSecretArn", {
      value:
        (cluster.secret!.secretFullArn && cluster.secret!.secretFullArn) || "",
    });
  }
}

interface ApplicationLoadBalancerStackProps extends StackProps {
  vpc: aws_ec2.Vpc;
}

export class ApplicationLoadBalancerStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: ApplicationLoadBalancerStackProps
  ) {
    super(scope, id, props);

    const vpc = props.vpc;
    const privateSubnetIds = vpc.privateSubnets.map(
      (subnet) => subnet.subnetId
    );

    // role for ec2 to communicate with ssm
    const role = new aws_iam.Role(this, `RoleForEc2AsgToAccessSSM`, {
      roleName: `RoleForEc2AsgToAccessSSM`,
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    // download some web data from s3
    role.attachInlinePolicy(
      new aws_iam.Policy(this, `PolicyForEc2AsgToReadS3`, {
        policyName: `PolicyForEc2AsgToReadS3`,
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

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        `PolicyForEc2AsgToAccessSSM`,
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
      )
    );

    // auto scaling group
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
        // subnetType: aws_ec2.SubnetType.PRIVATE_WITH_NAT,
        // availabilityZones: props.availabilityZones,
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

    // application load balancer
    const alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      "ALB",
      {
        vpc,
        internetFacing: true,
      }
    );

    // listener
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
  }
}
