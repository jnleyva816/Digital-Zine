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
  }): Promise<PreparedUpload>;
  getPublicUrl(storageKey: string): string;
}
