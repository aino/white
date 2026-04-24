# ISR — On-Demand Static Page Generation

## Why

Traditional static sites rebuild every page on every deploy. At scale (thousands of products, hundreds of locales), this is slow and expensive.

ISR solves this: pages are rendered on first request, cached at the edge, and invalidated individually when content changes. No full rebuilds, no stale content.

White supports two ISR providers:

| | Vercel ISR | AWS ISR |
|---|---|---|
| **Best for** | Most projects | High-traffic, cost-sensitive |
| **Setup** | Zero infrastructure | CDK deploy required |
| **Cache** | Vercel edge network | CloudFront + S3 |
| **Cost** | Included in Vercel plan | AWS pay-per-use |
| **Control** | Managed | Self-hosted |

---

## Vercel ISR

The simplest option. Vercel handles caching and invalidation.

### Setup

```js
// src/config.js
export const ISR = 'vercel'
```

Set environment variables in Vercel dashboard:
- `VERCEL_TOKEN` — from [vercel.com/account/tokens](https://vercel.com/account/tokens)
- `VERCEL_PROJECT_ID` — from Project Settings → General
- `VERCEL_TEAM_ID` — from Team Settings (if on a team)

Deploy normally with `vercel` or git push.

### How it works

```
Request → Vercel Edge
  ├── Cache HIT  → serve instantly
  └── Cache MISS → render on-demand → cache with tags → serve
```

Pages are cached indefinitely until explicitly invalidated. The invalidation API uses soft purge — visitors get the old page instantly while the new one renders in background.

### Invalidation

CMS webhook → `POST /api/revalidate` → Vercel purges matching tags.

```bash
curl -X POST https://your-site.vercel.app/api/revalidate \
  -H "Content-Type: application/json" \
  -d '{"contentType": "product", "id": "slim-finn"}'
```

### Local preview

The preview server simulates Vercel's edge cache locally:

```bash
npm run build:isr && npm run start
```

- `X-Local-Cache: HIT/MISS` header shows cache status
- `GET /api/revalidate` shows cache stats
- `POST /api/revalidate` invalidates locally

---

## AWS ISR

Self-hosted on your AWS account. More setup, but you control the infrastructure and costs.

### Architecture

```
yourdomain.com → CloudFront
├── /assets/*     → S3 (JS/CSS, immutable cache)
├── /api/*        → Vercel (edge functions)
├── /_vercel/*    → Vercel (image optimization)
└── /*            → S3 + Lambda@Edge
                     Cache HIT  → serve instantly
                     Cache MISS → render on-demand → save to S3 → serve
```

### Setup

#### 1. Enable AWS ISR

```js
// src/config.js
export const ISR = 'aws'
```

#### 2. Create `aws.config.js`

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

#### 3. AWS credentials

```bash
aws configure
# Access Key ID: <your key>
# Secret Access Key: <your secret>
# Region: us-east-1
# Output: json
```

#### 4. CDK bootstrap and deploy

```bash
cd @white/aws
npm install
npx cdk bootstrap
REVALIDATE_SECRET=your-secret npx cdk deploy
```

Copy the CDK outputs into `aws.config.js`.

#### 5. Environment variables

**Vercel** (Project Settings → Environment Variables):
- `REVALIDATE_SECRET` — same secret used in CDK deploy

**GitHub Actions** (for auto-deploy):
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `REVALIDATE_SECRET`

#### 6. DNS

Create a CNAME pointing your domain to the CloudFront distribution domain.

### Deploying

```bash
npm run deploy:aws
```

This builds assets, bundles Lambda handlers, uploads to S3, updates Lambda@Edge, pre-renders all routes, and invalidates CloudFront.

### Revalidation

1. CMS webhook → `POST /api/revalidate`
2. Render Lambda pre-renders affected pages to S3
3. CloudFront invalidation
4. Next request serves fresh page from S3

### Error handling

Three layers of resilience:

1. **Stale-while-revalidate** — render fails → serve last good version from S3
2. **Origin failover** — Lambda crashes → CloudFront retries on Vercel
3. **Pre-render on deploy** — old HTML stays as fallback

Users never see errors for pages that previously worked.

### Logs

```bash
node @white/aws/logs.js errors      # Recent errors
node @white/aws/logs.js renders     # Recent renders
node @white/aws/logs.js slow        # Slow renders (>1s)
node @white/aws/logs.js stats       # Cache hit/miss breakdown
node @white/aws/logs.js countries   # Requests by country
```

---

## Customizing invalidation

Edit `@white/api/revalidate.js` to map your CMS events to cache tags:

```js
async function resolveTags(payload) {
  const { contentType, id } = payload

  switch (contentType) {
    case 'product':
      return [`product-${id}`]
    case 'category':
      return [`category-${id}`]
    case 'page':
      return [`path-${id}`]
    default:
      return null  // purge everything
  }
}
```

### CMS webhook

Point your CMS to:
```
POST https://your-project.vercel.app/api/revalidate
```

With body:
```json
{ "contentType": "product", "id": "slim-finn" }
```

Optional: set `CMS_WEBHOOK_SECRET` env var for authentication.

---

## Config reference

### `src/config.js`

| `ISR` value | Behavior |
|---|---|
| `'vercel'` | Vercel edge caching + tag invalidation |
| `'aws'` | CloudFront + S3 + Lambda@Edge |
| `false` | Static build, all HTML generated at build time |

### `aws.config.js` (AWS only)

| Field | Description |
|---|---|
| `name` | Project identifier for AWS resource naming |
| `domain` | Production domain (for SSL certificate) |
| `vercelUrl` | Vercel deployment URL for API/image proxying |
| `aws.bucket` | S3 bucket name (from CDK output) |
| `aws.distributionId` | CloudFront distribution ID (from CDK output) |
| `aws.revalidateUrl` | API Gateway URL (from CDK output) |
| `aws.revalidateSecret` | Shared secret for revalidation API |
