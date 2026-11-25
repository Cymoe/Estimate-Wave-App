// The Ads library's Google Drive folder (adDrive.ts): clips shared to it from a phone come into the library without
// the page open. Pure: the consent link, the folder and file queries, and reading Drive's answers.
//
// The same Google client and return address as Gmail (lib/gmail.ts): the deployment needs the Drive API turned on
// in that Google project, and the drive.readonly scope on its consent screen.

import { gmailRedirect } from "./gmail";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const DRIVE_SCOPES = ["openid", "email", DRIVE_SCOPE];
/** The folder looked for when none is named. */
export const DEFAULT_FOLDER = "Ad clips";
/** How long a claimed file may stay "working" before it's handed out again (the runner stopped). */
export const CLAIM_STALE_MS = 60 * 60 * 1000;
/** Files claimed per ask: each is a download, a re-encode and an upload. */
export const CLAIM_LIMIT = 4;
/** The largest file imported: bigger ones are said, not tried. */
export const MAX_DRIVE_BYTES = 2 * 1024 * 1024 * 1024;

export function driveAuthUrl(state: string, loginHint?: string, env: Record<string, string | undefined> = process.env): string {
  const params = new URLSearchParams({
    client_id: env.AUTH_GOOGLE_ID ?? "",
    redirect_uri: gmailRedirect(),
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Drive's query string for a value in single quotes. */
const quoted = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** The search for a folder by its name (not in the bin). */
export const folderQuery = (name: string) => `mimeType = 'application/vnd.google-apps.folder' and name = ${quoted(name)} and trashed = false`;
/** The search for the videos in a folder (not in the bin). */
export const videosQuery = (folderId: string) => `${quoted(folderId)} in parents and mimeType contains 'video/' and trashed = false`;

export const listUrl = (q: string, pageToken?: string) =>
  `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
    q,
    fields: "nextPageToken, files(id, name, size, mimeType, createdTime)",
    pageSize: "100",
    orderBy: "createdTime",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    ...(pageToken ? { pageToken } : {}),
  })}`;

export type DriveFile = { id: string; name: string; size?: number; mimeType?: string };

/** Drive's list answer, read. */
export function readList(json: unknown): { files: DriveFile[]; next?: string } {
  const j = (json ?? {}) as { files?: Array<{ id?: unknown; name?: unknown; size?: unknown; mimeType?: unknown }>; nextPageToken?: unknown };
  const files = (j.files ?? [])
    .filter((f) => typeof f.id === "string" && typeof f.name === "string")
    .map((f) => ({ id: f.id as string, name: f.name as string, size: f.size !== undefined ? Number(f.size) : undefined, mimeType: typeof f.mimeType === "string" ? f.mimeType : undefined }));
  return { files, ...(typeof j.nextPageToken === "string" ? { next: j.nextPageToken } : {}) };
}
