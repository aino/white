# ISR — On-Demand Static Page Generation

## Why

Traditional static sites rebuild every page on every deploy. At scale (thousands of products, hundreds of locales), this is slow and expensive. Vercel's ISR solves this but at significant cost — $200-5,000+/month for high-traffic e-commerce sites.

White ISR gives you the same capability on infrastructure you own. Pages are built on-demand, cached globally, and invalidated individually. The AWS resources live in your account — you control the cost, the data, and the uptime.

- **Fast** — pages are served from CloudFront edge cache worldwide
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
                     Cache HIT  → serve instantly
                     Cache MISS → Lambda@Edge reads pre-rendered page from S3 (fast)
                                  or renders on-demand if not in S3 (first visit after deploy)
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
cd @white/isr
npm install
npx cdk bootstrap
```

### 5. First deploy

```bash
cd @white/isr
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
- `DRAFT_SECRET` — see [Draft Mode](README.md#draft-mode) in README

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
3. Bundles Lambda handlers (edge + render) with templates
4. Uploads assets + public files to S3
5. Updates Lambda@Edge and render Lambda function code
6. Publishes new Lambda@Edge version
7. Updates CloudFront to use new version
8. Pre-renders all routes to S3 (old HTML stays as fallback)
9. Waits for CloudFront propagation (~3-5 min)
10. Invalidates CloudFront cache

### Auto-deploy via GitHub Actions

Push to `main` triggers `.github/workflows/deploy.yml` which runs `npm run deploy:isr`. Requires AWS credentials and `REVALIDATE_SECRET` in GitHub Secrets.

## Revalidation (Stale-While-Revalidate)

When content changes in the CMS, pages are pre-rendered to S3 **before** CloudFront is invalidated. This means no visitor ever waits for a page to be built — they either get the old cached page (during CloudFront propagation) or the fresh pre-rendered page from S3.

### How it works

1. CMS sends webhook to Vercel `/api/revalidate`
2. `resolvePaths()` maps the CMS event to page paths
3. Vercel calls the AWS revalidation API with those paths
4. The **render Lambda** pre-renders each page (all locale variants) and saves to S3
5. After rendering completes, CloudFront is invalidated
6. During propagation (~3-5 min): visitors get the old cached page
7. After propagation: Lambda@Edge reads the pre-rendered page from S3 (instant)

For `paths: null` (purge everything), CloudFront is invalidated directly without pre-rendering — Lambda@Edge renders on the first hit, same as after a deploy.

### After a deploy

The deploy pre-renders all routes to S3 with the new templates. Old HTML is kept as fallback — if a render fails (e.g. API down), the previous version is served instead of an error. Once pre-rendering completes, CloudFront is invalidated so edge locations pick up the new pages.

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

## Error Handling

White ISR has three layers of resilience. Users never see errors for pages that were previously working.

### 1. Stale-while-revalidate

If a page render fails (API down, bad data, timeout), the edge handler serves the last successfully rendered version from S3. The stale page is cached for 60 seconds, then the next request retries the render. Errors are logged to CloudWatch.

```
Request → S3 cache miss → render fails → serve stale S3 version (200)
                                        → log error
                                        → retry on next request (after 60s)
```

### 2. Origin failover

If Lambda@Edge itself crashes (unhandled exception, OOM, timeout beyond the try/catch), CloudFront automatically retries the request on Vercel. This covers catastrophic failures that bypass application-level error handling.

### 3. Pre-render on deploy

Deploys pre-render all routes to S3 before invalidating CloudFront. Old HTML stays as fallback — it is never deleted. If the pre-render fails for a page, the previous version remains in S3 and continues to be served.

### What this means in practice

| Scenario | What the user sees |
|---|---|
| CMS API temporarily down | Last good version of the page |
| Bad data from API | Last good version of the page |
| Lambda timeout/OOM | Vercel renders the page (origin failover) |
| Bad deploy (render bug) | Last good version from previous deploy |
| First-ever page (no stale version) | 500 error page (rare — only for brand new routes with broken data) |

## Logs & Monitoring

Lambda@Edge logs every page render as structured JSON to CloudWatch: `uri`, `status`, `source` (s3 or render), `country`, `device`, `ua`, `duration`.

### Query logs

```bash
node @white/deploy/logs.js errors              # Recent errors
node @white/deploy/logs.js renders             # Recent page renders
node @white/deploy/logs.js slow                # Slow renders (>1s)
node @white/deploy/logs.js 404s                # 404s by path
node @white/deploy/logs.js stats               # Render source breakdown (s3 vs render)
node @white/deploy/logs.js countries           # Requests by country
node @white/deploy/logs.js devices             # Mobile vs desktop vs tablet
node @white/deploy/logs.js --query "QUERY"     # Custom CloudWatch Insights query
node @white/deploy/logs.js --hours 48          # Look back 48 hours (default: 24)
```

### Custom queries

The script accepts CloudWatch Logs Insights syntax:

```bash
# Mobile vs desktop in Sweden
node @white/deploy/logs.js --query "filter country = 'SE' | stats count(*) by device"

# Slowest pages by average render time
node @white/deploy/logs.js --query "filter source = 'render' | stats avg(duration) as avg_ms by uri | sort avg_ms desc"

# Crawler activity
node @white/deploy/logs.js --query "filter ua like /Googlebot/ | stats count(*) by uri | sort count(*) desc"
```

### CloudFront access logs

Full traffic data (including cache hits) is logged to S3 with 90-day retention. This captures every request — not just Lambda invocations. Query with Athena for traffic analytics.

### AI agent access

The `scripts/logs.js` header contains `DATA_ACCESS` instructions describing the log schema and example queries. AI agents (like support chatbots) can use this script to answer questions like "are there recent errors?" or "what's the device breakdown this week?"

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
