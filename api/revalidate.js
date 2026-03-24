import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront'

const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const cf = new CloudFrontClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.AWS_S3_BUCKET
const DISTRIBUTION_ID = process.env.AWS_CLOUDFRONT_DISTRIBUTION_ID

async function clearS3Html() {
  let deleted = 0
  let continuationToken

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        ContinuationToken: continuationToken,
      })
    )

    const htmlObjects = (list.Contents || []).filter(
      (obj) => obj.Key.endsWith('.html')
    )

    if (htmlObjects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: {
            Objects: htmlObjects.map((obj) => ({ Key: obj.Key })),
          },
        })
      )
      deleted += htmlObjects.length
    }

    continuationToken = list.NextContinuationToken
  } while (continuationToken)

  return deleted
}

async function invalidateCloudFront() {
  const result = await cf.send(
    new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        Paths: { Quantity: 1, Items: ['/*'] },
        CallerReference: Date.now().toString(),
      },
    })
  )
  return result.Invalidation.Id
}

export const POST = async (req) => {
  const { secret } = await req.json()

  if (secret !== process.env.REVALIDATE_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const deleted = await clearS3Html()
    const invalidationId = await invalidateCloudFront()

    return new Response(
      JSON.stringify({
        ok: true,
        deleted,
        invalidationId,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
