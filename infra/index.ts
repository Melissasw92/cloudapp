const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

/* =========================
 * 1) S3 static website bucket (public)
 * ========================= */
const site = new aws.s3.Bucket("site", {
  // No inline website config (deprecated); use the separate resource below.
  forceDestroy: true,
});

// Turn OFF Block Public Access so a website policy can work
const siteBap = new aws.s3.BucketPublicAccessBlock("site-bap", {
  bucket: site.id,
  blockPublicAcls: false,
  blockPublicPolicy: false,
  ignorePublicAcls: false,
  restrictPublicBuckets: false,
});

// Website hosting (index.html for both index/error is fine)
new aws.s3.BucketWebsiteConfiguration("site-website", {
  bucket: site.id,
  indexDocument: { suffix: "index.html" },
  errorDocument: { key: "index.html" },
});

// CORS (okay for now; you can tighten later)
new aws.s3.BucketCorsConfiguration("site-cors", {
  bucket: site.id,
  corsRules: [{ allowedMethods: ["GET", "HEAD"], allowedOrigins: ["*"], allowedHeaders: ["*"] }],
});

// Public-read policy for website objects (depends on BAP being off)
new aws.s3.BucketPolicy("site-policy", {
  bucket: site.id,
  policy: site.id.apply((id: string) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${id}/*`],
        },
      ],
    })
  ),
}, { dependsOn: [siteBap] });

/* =========================
 * 2) Networking helpers (default VPC + subnets)
 * ========================= */
const vpc = aws.ec2.getVpc({ default: true }, { async: true });
const subnetIds = pulumi.output(vpc).apply((v: { id: string }) => aws.ec2.getSubnetIds({ vpcId: v.id }, { async: true }));

/* =========================
 * 3) Security groups
 * ========================= */
const apiSg = new aws.ec2.SecurityGroup("api-sg", {
  vpcId: pulumi.output(vpc).id,
  description: "Allow HTTP to API",
  ingress: [{ protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }],
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
});

const dbSg = new aws.ec2.SecurityGroup("db-sg", {
  vpcId: pulumi.output(vpc).id,
  description: "Allow Postgres from API SG only",
  ingress: [{ protocol: "tcp", fromPort: 5432, toPort: 5432, securityGroups: [apiSg.id] }],
  egress: [{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
});

/* =========================
 * 4) EC2 instance (Amazon Linux 2 + Docker)
 *    NOTE: we use AL2 so the yum commands work reliably.
 * ========================= */
const ec2Role = new aws.iam.Role("ec2-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ec2.amazonaws.com" }),
});
new aws.iam.RolePolicyAttachment("ec2-ssm", {
  role: ec2Role.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
});
new aws.iam.RolePolicyAttachment("ec2-cw", {
  role: ec2Role.name,
  policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
});
const ec2Profile = new aws.iam.InstanceProfile("ec2-prof", { role: ec2Role.name });

const al2Ami = aws.ec2.getAmi({
  mostRecent: true,
  owners: ["137112412989"], // Amazon Linux 2 owner
  filters: [{ name: "name", values: ["amzn2-ami-hvm-*-x86_64-gp2"] }],
}, { async: true });

const userData = `#!/bin/bash
set -e
yum update -y
amazon-linux-extras install docker -y || yum install -y docker
systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user
`;

const api = new aws.ec2.Instance("api", {
  instanceType: "t3.micro",
  ami: pulumi.output(al2Ami).id,
  vpcSecurityGroupIds: [apiSg.id],
  iamInstanceProfile: ec2Profile.name,
  userData,
  tags: { Name: "api" },
});

/* =========================
 * 5) RDS Postgres (private; in default subnets)
 * ========================= */
const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnets", {
  subnetIds: pulumi.output(subnetIds).apply((s: { ids: string[] }) => s.ids),
  description: "Default VPC subnets",
});

const db = new aws.rds.Instance("db", {
  engine: "postgres",
  engineVersion: "16",
  instanceClass: "db.t3.micro",
  allocatedStorage: 20,
  dbName: "appdb",
  username: "appuser",
  password: "ChangeMe1234!", // TODO: move to SSM/Secrets Manager later
  publiclyAccessible: false,
  vpcSecurityGroupIds: [dbSg.id],
  dbSubnetGroupName: dbSubnetGroup.name,
  skipFinalSnapshot: true,
});

/* =========================
 * 6) Outputs
 * ========================= */
exports.bucket = site.bucket;
// Build the static website URL (bucket.websiteEndpoint is deprecated)
exports.websiteUrl = pulumi.interpolate`http://${site.bucket}.s3-website-${aws.getRegionOutput().name}.amazonaws.com`;
exports.apiIp = api.publicIp;
exports.apiDns = api.publicDns;
exports.dbHost = db.address;