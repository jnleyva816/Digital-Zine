import { describe, expect, it, vi } from "vitest";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { S3StorageDriver } from "./s3";

// DIG-108: a batch delete reports files it could not remove in its answer, it does not throw.
// Account deletion must not mistake that for success.
function driver(send: (command: unknown) => unknown) {
  const d = new S3StorageDriver({ bucket: "b", region: "auto", accessKeyId: "k", secretAccessKey: "s" });
  (d as unknown as { client: { send: unknown } }).client.send = vi.fn(async (command: unknown) => send(command));
  return d;
}

describe("S3StorageDriver.deletePrefix", () => {
  it("deletes every page of files under the prefix", async () => {
    const deleted: string[][] = [];
    const d = driver((command) => {
      if (command instanceof ListObjectsV2Command) {
        return command.input.ContinuationToken
          ? { Contents: [{ Key: "users/u/b" }], IsTruncated: false }
          : { Contents: [{ Key: "users/u/a" }], IsTruncated: true, NextContinuationToken: "t" };
      }
      if (command instanceof DeleteObjectsCommand) {
        deleted.push(command.input.Delete!.Objects!.map((o) => o.Key!));
        return {};
      }
      throw new Error("unexpected command");
    });
    await d.deletePrefix("users/u");
    expect(deleted).toEqual([["users/u/a"], ["users/u/b"]]);
  });

  it("throws when the store reports files it could not delete", async () => {
    const d = driver((command) =>
      command instanceof ListObjectsV2Command
        ? { Contents: [{ Key: "users/u/a" }, { Key: "users/u/b" }], IsTruncated: false }
        : { Errors: [{ Key: "users/u/b", Code: "AccessDenied", Message: "Access Denied" }] }
    );
    await expect(d.deletePrefix("users/u")).rejects.toThrow(/could not delete 1 of 2 files.*AccessDenied/i);
  });

  it("still tries the later pages before it throws, so one bad file does not strand the rest", async () => {
    let listed = 0;
    const deleteCalls: number[] = [];
    const d = driver((command) => {
      if (command instanceof ListObjectsV2Command) {
        listed++;
        return listed === 1
          ? { Contents: [{ Key: "users/u/a" }], IsTruncated: true, NextContinuationToken: "t" }
          : { Contents: [{ Key: "users/u/b" }], IsTruncated: false };
      }
      deleteCalls.push(deleteCalls.length);
      return deleteCalls.length === 1 ? { Errors: [{ Key: "users/u/a", Code: "InternalError" }] } : {};
    });
    await expect(d.deletePrefix("users/u")).rejects.toThrow(/could not delete 1 of 2 files/i);
    expect(deleteCalls).toHaveLength(2);
  });
});
