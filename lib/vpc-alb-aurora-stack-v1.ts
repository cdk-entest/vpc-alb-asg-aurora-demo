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
  aws_cloudwatch,
  Duration,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";

interface VpcAlbAuroraStackProps extends StackProps {
  vpcName: string;
  cidr: string;
}

export class VpcAlbAuroraStack extends Stack {
  public readonly vpc: aws_ec2.Vpc;
  public readonly databaseSG: aws_ec2.SecurityGroup;
  public readonly webServerSG: aws_ec2.SecurityGroup;
  public readonly asgSG: aws_ec2.SecurityGroup 
  public readonly albSG: aws_ec2.SecurityGroup 

  constructor(scope: Construct, id: string, props: VpcAlbAuroraStackProps) {
    super(scope, id, props);

    // create a new vpc
    const vpc = new aws_ec2.Vpc(this, "VpcAuroraDemo", {
      vpcName: props.vpcName,
      // cidr: props.cidr,
      ipAddresses: aws_ec2.IpAddresses.cidr(props.cidr),
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
          name: "PrivateIsolated",
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: "PrivateSubnetWithNat",
          subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // security group for webserver
    const webServerSG = new aws_ec2.SecurityGroup(
      this,
      "WebServerSecurityGroup",
      {
        securityGroupName: "WebServerSecurityGroup",
        vpc: vpc,
      }
    );
    webServerSG.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80));
    webServerSG.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(22));

    // security group for load balancer
    const albSG = new aws_ec2.SecurityGroup(this, "SGForLoadBalancer", {
      securityGroupName: "SGForLoadBalancer",
      vpc: vpc,
    });

    albSG.addIngressRule(aws_ec2.Peer.anyIpv4(), aws_ec2.Port.tcp(80));

    // security group for autoscaling group
    const asgSG = new aws_ec2.SecurityGroup(this, "SGForAutoScaling", {
      securityGroupName: "SGForAutoScaling",
      vpc: vpc,
    });

    asgSG.addIngressRule(
      aws_ec2.Peer.securityGroupId(albSG.securityGroupId),
      aws_ec2.Port.tcp(80)
    );

    // security group for db
    const databaseSG = new aws_ec2.SecurityGroup(
      this,
      "AuroraDbSecurityGroup",
      {
        securityGroupName: "AuroraDbSecurityGroup",
        vpc: vpc,
      }
    );

    databaseSG.addIngressRule(
      aws_ec2.Peer.securityGroupId(webServerSG.securityGroupId),
      aws_ec2.Port.tcp(3306)
    );

    databaseSG.addIngressRule(
      aws_ec2.Peer.securityGroupId(asgSG.securityGroupId),
      aws_ec2.Port.tcp(3306)
    );

    // add s3 interface endpoint
    vpc.addGatewayEndpoint("S3VpcEndpoint", {
      service: aws_ec2.GatewayVpcEndpointAwsService.S3,
    });

    // add vpc endpoint ssm
    vpc.addInterfaceEndpoint("VpcInterfaceEndpointSSM", {
      service: aws_ec2.InterfaceVpcEndpointAwsService.SSM,
    });

    this.vpc = vpc;
    this.databaseSG = databaseSG;
    this.webServerSG = webServerSG;
    this.asgSG = asgSG
    this.albSG = albSG
  }
}

interface AuroraDbStackProps extends StackProps {
  vpc: aws_ec2.Vpc;
  dbName: string;
  dbSG: aws_ec2.SecurityGroup;
}

export class AuroraDbStack extends Stack {
  constructor(scope: Construct, id: string, props: AuroraDbStackProps) {
    super(scope, id, props);

    const vpc: aws_ec2.Vpc = props.vpc;

    // aurora cluster
    const cluster = new aws_rds.DatabaseCluster(this, "AuroraDemo", {
      clusterIdentifier: "demo",
      defaultDatabaseName: props.dbName,
      engine: aws_rds.DatabaseClusterEngine.auroraMysql({
        version: aws_rds.AuroraMysqlEngineVersion.VER_2_07_2,
      }),
      // credentials: aws_rds.Credentials.fromGeneratedSecret("admin"),
      credentials: aws_rds.Credentials.fromGeneratedSecret("admin", {
        secretName: "aurora-secrete-name",
      }),
      instanceUpdateBehaviour: aws_rds.InstanceUpdateBehaviour.ROLLING,
      // storageType: aws_rds.DBClusterStorageType.AURORA_IOPT1,
      // backup: {
      //   retention: Duration.days(7),
      //   preferredWindow: "16:00-16:30",
      // },
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
      // ========================= NEW ==============================
      // could be no reader
      // readers: [
      //   aws_rds.ClusterInstance.provisioned("AuroraReader1", {
      //     instanceType: aws_ec2.InstanceType.of(
      //       aws_ec2.InstanceClass.BURSTABLE3,
      //       aws_ec2.InstanceSize.SMALL
      //     ),
      //     instanceIdentifier: "AuroraReader1",
      //     publiclyAccessible: false,
      //     // enablePerformanceInsights: true,
      //   }),
      // ],
      // writer: aws_rds.ClusterInstance.provisioned("AuroraWriter", {
      //   instanceType: aws_ec2.InstanceType.of(
      //     aws_ec2.InstanceClass.BURSTABLE3,
      //     aws_ec2.InstanceSize.SMALL
      //   ),
      //   instanceIdentifier: "AuroraWriter",
      //   publiclyAccessible: false,
      //   // enablePerformanceInsights: true,
      // }),
      // vpc: vpc,
      // vpcSubnets: {
      //   subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
      // },
      // securityGroups: [props.dbSG],
      // ========================= OLD ==============================
      instanceProps: {
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.BURSTABLE2,
          aws_ec2.InstanceSize.SMALL
        ),
        vpcSubnets: {
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
        vpc,
        securityGroups: [props.dbSG],
      },
      instances: 1,
    });

    // output
    new CfnOutput(this, "DbCredentialSecretArn", {
      value:
        (cluster.secret!.secretFullArn && cluster.secret!.secretFullArn) || "",
    });
  }
}

interface ApplicationLoadBalancerStackProps extends StackProps {
  vpc: aws_ec2.Vpc;
  asgSG: aws_ec2.SecurityGroup;
  albSG: aws_ec2.SecurityGroup;
  asgRole: aws_iam.Role;
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

    // auto scaling group
    const asg = new aws_autoscaling.AutoScalingGroup(this, "ASGForAuroraDemo", {
      autoScalingGroupName: "ASGForAuroraDemo",
      vpc,
      securityGroup: props.asgSG,
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T2,
        aws_ec2.InstanceSize.SMALL
      ),
      // machineImage: new aws_ec2.AmazonLinuxImage({
      //   generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      //   edition: aws_ec2.AmazonLinuxEdition.STANDARD,
      // }),
      machineImage: aws_ec2.MachineImage.latestAmazonLinux2023({
        cachedInContext: true,
      }),
      minCapacity: 2,
      maxCapacity: 10,
      role: props.asgRole,
      vpcSubnets: {
        // subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
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

    asg.addUserData(fs.readFileSync("./lib/script/user-data-2.sh", "utf8"));

    // application load balancer
    const alb = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      "LoadBalancerAuroraDemo",
      {
        loadBalancerName: "LoadBalancerAuroraDemo",
        vpc,
        vpcSubnets: {
          subnetType: aws_ec2.SubnetType.PUBLIC,
        },
        internetFacing: true,
        securityGroup: props.albSG,
        deletionProtection: false,
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

    asg.scaleOnRequestCount("ScaleOnRequestCount", {
      targetRequestsPerMinute: 60,
    });

    // scaling policy - step scaling
    const metric = new aws_cloudwatch.Metric({
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      statistic: "Average",
      period: Duration.minutes(1),
      dimensionsMap: {
        AutoScalingGroupName: asg.autoScalingGroupName,
      },
    });

    asg.scaleOnMetric("StepScaleOnCPUUsage", {
      metric: metric,
      scalingSteps: [
        {
          upper: 1,
          change: -1,
        },
        {
          lower: 10,
          change: +1,
        },
        {
          lower: 60,
          change: +3,
        },
      ],
      adjustmentType: aws_autoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
    });
  }
}

export class RoleForEc2 extends Stack {
  public readonly webRole : aws_iam.Role;
  public readonly asgRole: aws_iam.Role;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const asgRole = new aws_iam.Role(this, "RoleForAsgAuroraDemo", {
      roleName: "RoleForAsgAuroraDemo",
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    asgRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        `PolicyForEc2AsgToAccessSSM`,
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
      )
    );

    asgRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AWSCloudFormationReadOnlyAccess"
      )
    );

    asgRole.attachInlinePolicy(
      new aws_iam.Policy(this, "PolicyForAsgToGetSecretDb", {
        policyName: "PolicyForAsgToGetSecretDb",
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["secretsmanager:GetSecretValue"],
            resources: ["arn:aws:secretsmanager:*"],
          }),
        ],
      })
    );

    const role = new aws_iam.Role(this, "RoleForWebServerAuroraDemo", {
      roleName: "RoleForWebServerAuroraDemo",
      assumedBy: new aws_iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonSSMManagedInstanceCore"
      )
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AWSCloudFormationReadOnlyAccess"
      )
    );

    role.attachInlinePolicy(
      new aws_iam.Policy(this, "PolicyForEc2AccessRdsRedisDemo", {
        policyName: "PolicyForEc2AccessRdsRedisDemo",
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            actions: ["secretsmanager:GetSecretValue"],
            resources: ["arn:aws:secretsmanager:*"],
          }),
        ],
      })
    );


    this.webRole = role;
    this.asgRole = asgRole
  }
}

interface WebServerProps extends StackProps {
  vpc: aws_ec2.Vpc;
  sg: aws_ec2.SecurityGroup;
  role: aws_iam.Role;
}

export class WebServerStack extends Stack {
  constructor(scope: Construct, id: string, props: WebServerProps) {
    super(scope, id, props);

    const ec2 = new aws_ec2.Instance(this, "WebServerAuroraDemo", {
      instanceName: "WebServerAuroraDemo",
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T3,
        aws_ec2.InstanceSize.SMALL
      ),
      // machineImage: aws_ec2.MachineImage.latestAmazonLinux2({
      //   edition: aws_ec2.AmazonLinuxEdition.STANDARD,
      //   storage: aws_ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      // }),
      machineImage: aws_ec2.MachineImage.latestAmazonLinux2023({
        cachedInContext: true,
      }),
      vpc: props.vpc,
      role: props.role,
      securityGroup: props.sg,
      vpcSubnets: {
        subnetType: aws_ec2.SubnetType.PUBLIC,
      },
    });

    // add user data for ec2
    ec2.addUserData(fs.readFileSync("./lib/script/user-data-2.sh", "utf8"));
  }
}
