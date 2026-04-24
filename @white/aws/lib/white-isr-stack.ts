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

    // S3 bucket for CloudFront access logs (full traffic analytics)
    const logBucket = new s3.Bucket(this, 'AccessLogs', {
      bucketName: `white-isr-${clientName}-logs`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        { expiration: cdk.Duration.days(90) },
      ],
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
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
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../dist/isr/bundle')),
      timeout: cdk.Duration.seconds(5),
      memorySize: 256,
    })

    // Grant Lambda read/write access to S3
    bucket.grantReadWrite(edgeFunction)

    // Render Lambda — pre-renders pages to S3 on revalidation
    const renderFunction = new lambda.Function(this, 'RenderHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../../dist/isr/render-bundle')),
      timeout: cdk.Duration.seconds(120),
      memorySize: 512,
      environment: {
        BUCKET: bucket.bucketName,
        DISTRIBUTION_ID: '', // set after distribution is created
      },
    })

    bucket.grantReadWrite(renderFunction)

    // S3 origin with OAC
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket)

    // Vercel origin for API routes, images, and failover
    const vercelOrigin = new origins.HttpOrigin(vercelUrl, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    })

    // Origin failover group: S3 + Lambda@Edge primary, Vercel fallback
    // If Lambda@Edge throws (502/503/504), CloudFront retries on Vercel
    const failoverOrigin = new origins.OriginGroup({
      primaryOrigin: s3Origin,
      fallbackOrigin: vercelOrigin,
      fallbackStatusCodes: [500, 502, 503, 504],
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
      logBucket,
      logFilePrefix: 'cdn/',

      // Default behavior: S3 + Lambda@Edge, failover to Vercel on error
      defaultBehavior: {
        origin: failoverOrigin,
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

        // Vercel image optimization — must forward query strings (url, w, q)
        '/_vercel/*': {
          origin: vercelOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'VercelImageCache', {
            cachePolicyName: `white-isr-${clientName}-vercel-image`,
            defaultTtl: cdk.Duration.days(30),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.days(1),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
          }),
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    })

    // Wire render Lambda to CloudFront (now that distribution exists)
    renderFunction.addEnvironment('DISTRIBUTION_ID', distribution.distributionId)
    renderFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      })
    )

    // Revalidation Lambda — pre-renders then invalidates, or purges all
    const revalidateFunction = new lambda.Function(this, 'RevalidateHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { CloudFrontClient, CreateInvalidationCommand } = require("@aws-sdk/client-cloudfront");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const cf = new CloudFrontClient({ region: "us-east-1" });
const lambdaClient = new LambdaClient({ region: "us-east-1" });

exports.handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  if (body.secret !== process.env.REVALIDATE_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const paths = body.paths;

  if (paths && paths.length > 0) {
    // Specific paths — invoke render Lambda async (pre-render to S3, then invalidate CF)
    await lambdaClient.send(new InvokeCommand({
      FunctionName: process.env.RENDER_FUNCTION_NAME,
      InvocationType: "Event",
      Payload: JSON.stringify({ paths }),
    }));

    return {
      statusCode: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, mode: "pre-render", paths }),
    };
  }

  // No specific paths — purge everything via direct CF invalidation
  const inv = await cf.send(new CreateInvalidationCommand({
    DistributionId: process.env.DISTRIBUTION_ID,
    InvalidationBatch: {
      Paths: { Quantity: 1, Items: ["/*"] },
      CallerReference: Date.now().toString(),
    },
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, mode: "purge-all", invalidationId: inv.Invalidation.Id }),
  };
};
      `),
      environment: {
        DISTRIBUTION_ID: distribution.distributionId,
        REVALIDATE_SECRET: revalidateSecret,
        RENDER_FUNCTION_NAME: renderFunction.functionName,
      },
      timeout: cdk.Duration.seconds(10),
    })

    revalidateFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      })
    )

    renderFunction.grantInvoke(revalidateFunction)

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

    new cdk.CfnOutput(this, 'LogBucket', {
      value: logBucket.bucketName,
      description: 'S3 bucket for CloudFront access logs (90 day retention)',
    })
  }
}
