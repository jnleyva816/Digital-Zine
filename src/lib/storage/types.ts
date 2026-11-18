export interface PreparedUpload {
  driver: "local" | "s3";
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  publicUrl: string;
}

export interface StorageDriver {
  readonly name: "local" | "s3";
  prepareUpload(params: {
    storageKey: string;
    contentType: string;
    /** The file's declared size in bytes. S3 signs it, so a body of any other size is refused. */
    size?: number;
  }): Promise<PreparedUpload>;
  getPublicUrl(storageKey: string): string;
  /** The stored object's real size in bytes, or null when it does not exist. */
  getObjectSize(storageKey: string): Promise<number | null>;
  /** Removes the object. Missing objects are not an error. */
  deleteObject(storageKey: string): Promise<void>;
}
