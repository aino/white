# ISR — On-Demand Static Page Generation

## Why

Traditional static sites rebuild every page on every deploy. At scale (thousands of products, hundreds of locales), this is slow and expensive. Vercel's ISR solves this but at significant cost — $200-5,000+/month for high-traffic e-commerce sites.

White ISR gives you the same capability on infrastructure you own. Pages are built on-demand, cached globally, and invalidated individually. The AWS resources live in your account — you control the cost, the data, and the uptime.

- **Fast** — pages served from CloudFront edge cache worldwide
- **Cheap** — S3 + CloudFront costs pennies compared to serverless rendering on every request
- **Simple** — one config file, one deploy command
- **Yours** — no vendor lock-in, you own the infrastructure

## Architecture

```
yourdomain.com → CloudFront
├── /assets/*     → S3 (JS/CSS, immutable cache)
├── /api/*        → Vercel (edge functions)
├── /_vercel/*    → Vercel (image optimization)
└── /*            → S3 + Lambda@Edge
                     Cache HIT → serve instantly
                     Cache MISS → Lambda renders page, saves to S3, caches in CloudFront
```

**Production** traffic goes through CloudFront. AWS handles page serving at scale.

**Vercel** handles API routes, image optimization, preview deploys, and draft mode. When ISR is enabled, all Vercel page requests are rendered dynamically — no static HTML is built. This means every preview deploy and draft session always shows live data.

## Setup

### 1. Enable ISR

```js
// src/config.js
export const ISR = true
```

When `true`:
- Vercel builds assets only (no HTML) and renders all pages dynamically
- Production pages are served from AWS (CloudFront + Lambda@Edge)
- Draft mode and preview deploys use Vercel's dynamic rendering

When `false`:
- Vercel builds static HTML and serves it directly
- No AWS infrastructure needed
- Draft mode still works via the catch-all function

### 2. Create `isr.config.js`

```js
export default {
  name: 'my-project',
  domain: 'mysite.com',
  vercelUrl: 'my-project.vercel.app',
  aws: {
    bucket: '',          // filled after CDK deploy
    distributionId: '',  // filled after CDK deploy
    revalidateUrl: '',   // filled after CDK deploy
    revalidateSecret: process.env.REVALIDATE_SECRET,
  },
}
```

### 3. AWS account

1. Create an AWS account at [aws.amazon.com](https://aws.amazon.com)
2. Create an IAM user with `AdministratorAccess` (CLI access only, no console)
3. Create an access key for the user
4. Configure credentials:
   ```bash
   aws configure
   # Access Key ID: <your key>
   # Secret Access Key: <your secret>
   # Region: us-east-1
   # Output: json
   ```

### 4. Install CDK and bootstrap

```bash
cd isr
npm install
npx cdk bootstrap
```

### 5. First deploy

```bash
cd isr
REVALIDATE_SECRET=your-secret npx cdk deploy
```

CDK outputs three values — copy them into `isr.config.js`:

```
white-isr-my-project.BucketName = white-isr-my-project
white-isr-my-project.DistributionId = EXXXXXXXXXX
white-isr-my-project.RevalidateUrl = https://xxx.execute-api.us-east-1.amazonaws.com/prod/revalidate
```

### 6. Set environment variables

**Vercel** (Project Settings → Environment Variables):
- `REVALIDATE_SECRET` — same secret used in CDK deploy

**GitHub Actions** (Settings → Secrets → Actions) for auto-deploy:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `REVALIDATE_SECRET`

### 7. Point DNS

Create a CNAME record pointing your domain to the CloudFront distribution domain (shown in CDK output as `DistributionDomain`).

## Deploying

```bash
npm run deploy:isr
```

This runs:
1. Builds JS/CSS assets (Vite, no HTML)
2. Compiles page templates (esbuild)
3. Bundles Lambda handler with templates
4. Uploads assets to S3
5. Updates Lambda function code
6. Publishes new Lambda version
7. Updates CloudFront to use new version
8. Waits for CloudFront propagation (~3-5 min)
9. Invalidates CloudFront cache

### Auto-deploy via GitHub Actions

Push to `main` triggers `.github/workflows/deploy.yml` which runs `npm run deploy:isr`. Requires AWS credentials and `REVALIDATE_SECRET` in GitHub Secrets.

## Revalidation

### How it works

1. CMS sends webhook to Vercel `/api/revalidate`
2. `resolvePaths()` maps the CMS event to page paths
3. Vercel calls the AWS revalidation API with those paths
4. AWS invalidates CloudFront for those paths
5. Next visitor triggers Lambda@Edge to render fresh

### Customizing `api/revalidate.js`

Edit the `resolvePaths()` function for your CMS data model:

```js
async function resolvePaths(payload) {
  const { contentType, id } = payload

  switch (contentType) {
    case 'product':
      return [`/*/products/${id}`, '/']

    case 'category':
      return [`/*/products/*`]

    case 'page':
      return [`/*/${id}`]

    default:
      return null  // null = purge everything
  }
}
```

### Wildcard patterns

CloudFront supports `*` in invalidation paths:
- `/*/products/slim-finn` — one product, all locales
- `/*/products/*` — all products, all locales
- `/*` — everything

### CMS webhook setup

Point your CMS webhook to:
```
POST https://your-project.vercel.app/api/revalidate
```

With a JSON body like:
```json
{ "contentType": "product", "id": "slim-finn" }
```

Optional: set `CMS_WEBHOOK_SECRET` env var on Vercel and send `{ "secret": "xxx", ... }` from the CMS for authentication.

## Config reference

### `isr.config.js`

| Field | Description |
|---|---|
| `name` | Project identifier. Used for AWS resource naming (`white-isr-{name}`) |
| `domain` | Production domain (used for SSL certificate) |
| `vercelUrl` | Vercel deployment URL (e.g. `project.vercel.app`). CloudFront proxies `/api/*` here |
| `aws.bucket` | S3 bucket name (from CDK output) |
| `aws.distributionId` | CloudFront distribution ID (from CDK output) |
| `aws.revalidateUrl` | API Gateway URL for revalidation (from CDK output) |
| `aws.revalidateSecret` | Shared secret for revalidation API. Use `process.env.REVALIDATE_SECRET` |

### `src/config.js`

| Field | Description |
|---|---|
| `ISR` | `true` — Vercel renders dynamically, production on AWS. `false` — Vercel serves static HTML, no AWS needed |
