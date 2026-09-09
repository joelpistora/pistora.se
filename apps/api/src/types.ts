// Data-transfer objects the storage API returns. Kept plain and JSON-serialisable
// so they can move to `packages/shared` unchanged once `apps/web` consumes them.

export interface FileEntry {
  name: string;
  type: "file" | "directory";
  /** Bytes. Always 0 for directories. */
  size: number;
  /** ISO 8601. */
  modifiedAt: string;
}

export interface DirListing {
  /** Normalised relative path from the storage root. "" is the root itself. */
  path: string;
  entries: FileEntry[];
}

export interface FileMetadata extends FileEntry {
  path: string;
  /** ISO 8601. Birthtime where the platform reports it, else the same as modifiedAt. */
  createdAt: string;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
