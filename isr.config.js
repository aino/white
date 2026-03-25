export default {
  name: 'white-test',
  // domain: 'example.com',
  vercelUrl: 'white-git-feature-isr-aino.vercel.app',
  aws: {
    bucket: 'white-isr-white-test',
    distributionId: 'E111NKUSRINWHB',
    revalidateUrl: 'https://nv2muz9nn1.execute-api.us-east-1.amazonaws.com/prod/revalidate',
    revalidateSecret: process.env.REVALIDATE_SECRET,
  },
}
