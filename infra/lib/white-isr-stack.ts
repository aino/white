import * as cdk from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as apigateway from 'aws-cdk-lib/aws-apigateway'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface WhiteIsrProps extends cdk.StackProps {
  clientName: string
  domain?: string
  alternativeDomains?: string[]
  vercelUrl: string
  revalidateSecret: string
}

export class WhiteIsrStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WhiteIsrProps) {
    super(scope, id, props)

    const { clientName, domain, alternativeDomains = [], vercelUrl, revalidateSecret } = props

    // S3 bucket for HTML pages and static assets
    const bucket = new s3.Bucket(this, 'Pages', {
      bucketName: `white-isr-${clientName}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    })

    // SSL certificate (only if custom domain is provided)
    let certificate: acm.ICertificate | undefined
    if (domain) {
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: domain,
        subjectAlternativeNames: alternativeDomains.length > 0
          ? alternativeDomains
          : [`*.${domain}`],
        validation: acm.CertificateValidation.fromDns(),
      })
    }

    // Lambda@Edge for on-demand page building
    const edgeFunction = new cloudfront.experimental.EdgeFunction(this, 'IsrHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/bundle')),
      timeout: cdk.Duration.seconds(5),
      memorySize: 256,
    })

    // Grant Lambda read/write access to S3
    bucket.grantReadWrite(edgeFunction)

    // S3 origin with OAC
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket)

    // Vercel origin for API routes and images
    const vercelOrigin = new origins.HttpOrigin(vercelUrl, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    })

    // Cache policies
    const immutableCachePolicy = new cloudfront.CachePolicy(this, 'ImmutableAssets', {
      cachePolicyName: `white-isr-${clientName}-immutable`,
      defaultTtl: cdk.Duration.days(365),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    })

    const apiCachePolicy = new cloudfront.CachePolicy(this, 'ApiPassthrough', {
      cachePolicyName: `white-isr-${clientName}-api`,
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(0),
      minTtl: cdk.Duration.seconds(0),
    })

    // Origin request policy for API (forward all headers, cookies, query strings)
    const apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(this, 'ApiOriginRequest', {
      originRequestPolicyName: `white-isr-${clientName}-api-origin`,
      headerBehavior: cloudfront.OriginRequestHeaderBehavior.all(),
      queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
    })

    // Domain config — only if custom domain provided
    const domainNames = domain ? [domain, ...alternativeDomains] : undefined

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'CDN', {
      domainNames,
      certificate,
      defaultRootObject: 'index.html',

      // Default behavior: S3 pages with Lambda@Edge ISR
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        edgeLambdas: [
          {
            functionVersion: edgeFunction.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
          },
        ],
      },

      additionalBehaviors: {
        // Static assets — immutable, long cache
        '/assets/*': {
          origin: s3Origin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: immutableCachePolicy,
        },

        // API routes — pass through to Vercel
        '/api/*': {
          origin: vercelOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: apiCachePolicy,
          originRequestPolicy: apiOriginRequestPolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },

        // Vercel image optimization
        '/_vercel/*': {
          origin: vercelOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
    })

    // Revalidation Lambda — clears S3 HTML + invalidates CloudFront
    const revalidateFunction = new lambda.Function(this, 'RevalidateHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { CloudFrontClient, CreateInvalidationCommand } = require("@aws-sdk/client-cloudfront");

const s3 = new S3Client({ region: "us-east-1" });
const cf = new CloudFrontClient({ region: "us-east-1" });

async function deleteAllHtml(bucket) {
  let deleted = 0;
  let token;
  do {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    const htmlObjects = (list.Contents || []).filter(o => o.Key.endsWith(".html"));
    if (htmlObjects.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: htmlObjects.map(o => ({ Key: o.Key })) } }));
      deleted += htmlObjects.length;
    }
    token = list.NextContinuationToken;
  } while (token);
  return deleted;
}

async function deletePaths(bucket, paths) {
  const keys = paths.map(p => {
    const clean = p.replace(/^\\//, "").replace(/\\/$/, "");
    return clean ? clean + "/index.html" : "index.html";
  });
  if (keys.length === 0) return 0;
  await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map(Key => ({ Key })) } }));
  return keys.length;
}

exports.handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  if (body.secret !== process.env.REVALIDATE_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const bucket = process.env.BUCKET;
  const distributionId = process.env.DISTRIBUTION_ID;
  const paths = body.paths;

  // Delete HTML: specific paths or all
  const deleted = paths && paths.length > 0
    ? await deletePaths(bucket, paths)
    : await deleteAllHtml(bucket);

  // Invalidate CloudFront: specific paths or all
  const cfPaths = paths && paths.length > 0
    ? paths.map(p => p.startsWith("/") ? p : "/" + p)
    : ["/*"];

  const inv = await cf.send(new CreateInvalidationCommand({
    DistributionId: distributionId,
    InvalidationBatch: {
      Paths: { Quantity: cfPaths.length, Items: cfPaths },
      CallerReference: Date.now().toString(),
    },
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, deleted, invalidationId: inv.Invalidation.Id, paths: cfPaths }),
  };
};
      `),
      environment: {
        BUCKET: bucket.bucketName,
        DISTRIBUTION_ID: distribution.distributionId,
        REVALIDATE_SECRET: revalidateSecret,
      },
      timeout: cdk.Duration.seconds(30),
    })

    // Grant revalidation Lambda access to S3 and CloudFront
    bucket.grantReadWrite(revalidateFunction)
    revalidateFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      })
    )

    // API Gateway
    const api = new apigateway.LambdaRestApi(this, 'RevalidateApi', {
      handler: revalidateFunction,
      proxy: false,
      restApiName: `white-isr-${clientName}-revalidate`,
    })

    const revalidateResource = api.root.addResource('revalidate')
    revalidateResource.addMethod('POST')

    // Outputs
    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution URL (use this for testing without custom domain)',
    })

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID for cache invalidation',
    })

    new cdk.CfnOutput(this, 'BucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket for deploying assets and pages',
    })

    new cdk.CfnOutput(this, 'RevalidateUrl', {
      value: `${api.url}revalidate`,
      description: 'POST to this URL with { "secret": "..." } to purge all cached pages',
    })

    new cdk.CfnOutput(this, 'RevalidateSecret', {
      value: revalidateSecret,
      description: 'Secret for the revalidation webhook',
    })
  }
}
