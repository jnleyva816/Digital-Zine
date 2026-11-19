import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PreparedUpload, StorageDriver } from "./types";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  publicBaseUrl?: string;
}

export class S3StorageDriver implements StorageDriver {
  readonly name = "s3" as const;
  private readonly client: S3Client;
  private readonly config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    this.config = config;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  getPublicUrl(storageKey: string): string {
    const cleanKey = storageKey
      .split("/")
      .filter(Boolean)
      .map((s) => encodeURIComponent(s))
      .join("/");

    if (this.config.publicBaseUrl) {
      return `${this.config.publicBaseUrl.replace(/\/+$/, "")}/${cleanKey}`;
    }
    if (this.config.endpoint) {
      return `${this.config.endpoint.replace(/\/+$/, "")}/${this.config.bucket}/${cleanKey}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${cleanKey}`;
  }

  async getObjectSize(storageKey: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: storageKey }));
      return typeof head.ContentLength === "number" ? head.ContentLength : null;
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async getObject(storageKey: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: storageKey }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async putObject(storageKey: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: storageKey,
        Body: bytes,
        ContentType: contentType,
        // Variant keys never change content, so browsers and CDNs may keep them forever.
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: storageKey }));
  }

  async prepareUpload(params: {
    storageKey: string;
    contentType: string;
    size?: number;
  }): Promise<PreparedUpload> {
    const contentType = params.contentType || "application/octet-stream";
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: params.storageKey,
      ContentType: contentType,
      ...(params.size !== undefined ? { ContentLength: params.size } : {}),
    });

    // Signing Content-Length makes S3 refuse a body of any other size, so the size checked at
    // presign time is the size that gets stored (DIG-32).
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: 600,
      ...(params.size !== undefined ? { signableHeaders: new Set(["content-length"]) } : {}),
    });

    return {
      driver: "s3",
      storageKey: params.storageKey,
      uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      publicUrl: this.getPublicUrl(params.storageKey),
    };
  }
}
