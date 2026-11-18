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
  /** The object's bytes, or null when it does not exist. Server-side only (DIG-26). */
  getObject(storageKey: string): Promise<Buffer | null>;
  /** Writes an object the server made, such as an image variant (DIG-26). */
  putObject(storageKey: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Removes the object. Missing objects are not an error. */
  deleteObject(storageKey: string): Promise<void>;
}
