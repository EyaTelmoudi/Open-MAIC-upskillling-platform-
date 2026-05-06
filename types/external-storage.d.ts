declare module 'pg' {
  export class Pool {
    constructor(options?: Record<string, unknown>);
    connect(): Promise<{
      query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
      release(): void;
    }>;
    query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  }
}

declare module 'minio' {
  import { EventEmitter } from 'events';

  export class Client {
    constructor(options: Record<string, unknown>);
    bucketExists(bucket: string): Promise<boolean>;
    makeBucket(bucket: string): Promise<void>;
    putObject(
      bucket: string,
      objectName: string,
      stream: Buffer,
      size?: number,
      metaData?: Record<string, string>,
    ): Promise<void>;
    getObject(bucket: string, objectName: string): Promise<NodeJS.ReadableStream>;
    statObject(bucket: string, objectName: string): Promise<{ size: number }>;
    removeObject(bucket: string, objectName: string): Promise<void>;
    removeObjects(bucket: string, objects: string[]): Promise<void>;
    listObjectsV2(bucket: string, prefix?: string, recursive?: boolean): EventEmitter;
  }
}
