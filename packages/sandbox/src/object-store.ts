// ObjectStore — durable storage for project snapshots (tarballs of /workspace).
// The Sandbox interface stays backend-agnostic; persistence is a separate
// abstraction so the snapshot backend (MinIO today; S3/GCS later) is swappable.
// See ADR-0008.

import { Readable } from 'node:stream';

import * as Minio from 'minio';

export interface ObjectStore {
  /** Store the snapshot tarball for a project (overwrites any existing). */
  putSnapshot(projectId: string, body: Readable): Promise<void>;
  /** Fetch the snapshot tarball, or null when none exists. */
  getSnapshot(projectId: string): Promise<Readable | null>;
  /** Whether a snapshot exists for the project. */
  hasSnapshot(projectId: string): Promise<boolean>;
  /** Remove a project's snapshot (no-op when none exists). */
  deleteSnapshot(projectId: string): Promise<void>;
}

function snapshotKey(projectId: string): string {
  return `${projectId}/workspace.tar`;
}

async function collect(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(typeof c === 'string' ? Buffer.from(c) : (c as Buffer));
  return Buffer.concat(chunks);
}

/** In-memory store — used by tests and as a safe default when MinIO is
 *  unconfigured. Snapshots do not survive process restart. */
export class InMemoryObjectStore implements ObjectStore {
  private readonly snapshots = new Map<string, Buffer>();

  async putSnapshot(projectId: string, body: Readable): Promise<void> {
    this.snapshots.set(projectId, await collect(body));
  }

  async getSnapshot(projectId: string): Promise<Readable | null> {
    const buf = this.snapshots.get(projectId);
    return buf ? Readable.from(buf) : null;
  }

  async hasSnapshot(projectId: string): Promise<boolean> {
    return this.snapshots.has(projectId);
  }

  async deleteSnapshot(projectId: string): Promise<void> {
    this.snapshots.delete(projectId);
  }
}

export interface MinioObjectStoreConfig {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  /** Single bucket; snapshots are keyed by project (see snapshotKey). */
  bucket: string;
}

/** MinIO-backed store (S3-compatible). One bucket, one object per project. */
export class MinioObjectStore implements ObjectStore {
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private bucketReady?: Promise<void>;

  constructor(config: MinioObjectStoreConfig) {
    this.client = new Minio.Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL ?? false,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    this.bucket = config.bucket;
  }

  /** Build a MinioObjectStore from MINIO_* env, or null if unconfigured. */
  static fromEnv(): MinioObjectStore | null {
    const endPoint = process.env.MINIO_ENDPOINT;
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    if (!endPoint || !accessKey || !secretKey) return null;
    return new MinioObjectStore({
      endPoint,
      port: process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : undefined,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
      bucket: process.env.MINIO_BUCKET ?? 'praxis-sandboxes',
    });
  }

  private async ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = (async () => {
        if (!(await this.client.bucketExists(this.bucket))) {
          await this.client.makeBucket(this.bucket);
        }
      })();
    }
    return this.bucketReady;
  }

  async putSnapshot(projectId: string, body: Readable): Promise<void> {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, snapshotKey(projectId), body);
  }

  async getSnapshot(projectId: string): Promise<Readable | null> {
    try {
      return await this.client.getObject(this.bucket, snapshotKey(projectId));
    } catch {
      return null; // NoSuchKey / NoSuchBucket
    }
  }

  async hasSnapshot(projectId: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, snapshotKey(projectId));
      return true;
    } catch {
      return false;
    }
  }

  async deleteSnapshot(projectId: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, snapshotKey(projectId));
    } catch {
      // No snapshot / bucket — nothing to remove.
    }
  }
}
