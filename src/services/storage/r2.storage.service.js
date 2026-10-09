import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../../configs/app.config';

class R2StorageService {
  constructor() {
    const accountId = config.get('r2.accountId');
    const accessKeyId = config.get('r2.accessKeyId');
    const secretAccessKey = config.get('r2.secretAccessKey');
    
    this.bucketName = config.get('r2.bucketName');

    if (accountId && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      console.warn("R2 credentials missing. Storage service won't work in production.");
      // We still instantiate it just so it doesn't crash on boot if dev env is missing it.
      this.client = new S3Client({ region: 'auto' });
    }
  }

  /**
   * Generates a presigned URL that the frontend can use to upload directly to R2.
   */
  async generatePresignedUploadUrl(objectKey, contentType) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: contentType
    });

    // 15 minutes expiration
    const signedUrl = await getSignedUrl(this.client, command, { expiresIn: 900 });
    return signedUrl;
  }

  /**
   * Generates a temporary presigned URL for playback.
   */
  async generatePresignedDownloadUrl(objectKey) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey
    });

    // 4 hours expiration for playback sessions
    const signedUrl = await getSignedUrl(this.client, command, { expiresIn: 14400 });
    return signedUrl;
  }

  /**
   * Deletes an object from the bucket.
   */
  async deleteObject(objectKey) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey
    });

    await this.client.send(command);
    return true;
  }
}

export default new R2StorageService();
