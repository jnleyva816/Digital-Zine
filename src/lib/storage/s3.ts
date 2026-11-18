import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

  async prepareUpload(params: {
    storageKey: string;
    contentType: string;
  }): Promise<PreparedUpload> {
    const contentType = params.contentType || "application/octet-stream";
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: params.storageKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: 600,
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
