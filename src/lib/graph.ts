type GraphTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphDriveItem = {
  id?: string;
  name?: string;
  webUrl?: string;
  size?: number;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  "@microsoft.graph.downloadUrl"?: string;
};

type GraphDriveChildrenResponse = {
  value?: GraphDriveItem[];
  "@odata.nextLink"?: string;
};

export type DriveCourse = {
  id: string;
  name: string;
  webUrl: string | null;
};

export type DriveFileItem = {
  id: string;
  name: string;
  kind: "folder" | "file";
  mimeType: string | null;
  size: number | null;
  webUrl: string | null;
  downloadUrl: string | null;
  isVideo: boolean;
  createdDateTime: string | null;
  lastModifiedDateTime: string | null;
};

type CachedGraphToken = {
  token: string;
  expiresAtMs: number;
};

let cachedGraphToken: CachedGraphToken | null = null;
let pendingGraphToken: Promise<string> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getTargetMailbox(): string {
  const first = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);
  if (!first) {
    throw new Error("Missing ADMIN_EMAILS configuration");
  }
  return first;
}

async function getMicrosoftGraphAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedGraphToken && cachedGraphToken.expiresAtMs > now + 60_000) {
    return cachedGraphToken.token;
  }
  if (pendingGraphToken) {
    return pendingGraphToken;
  }

  pendingGraphToken = (async () => {
    const tenantId = getRequiredEnv("AZURE_TENANT_ID");
    const clientId = getRequiredEnv("AZURE_CLIENT_ID");
    const clientSecret = getRequiredEnv("AZURE_CLIENT_SECRET");
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    });
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const json = (await response.json()) as GraphTokenResponse;
    if (!response.ok || !json.access_token) {
      throw new Error(
        `Auth token request failed: ${json.error ?? response.status} ${
          json.error_description ?? ""
        }`.trim(),
      );
    }
    const expiresInSec = Number(json.expires_in ?? 3600);
    cachedGraphToken = {
      token: json.access_token,
      expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
    };
    return cachedGraphToken.token;
  })();

  try {
    return await pendingGraphToken;
  } finally {
    pendingGraphToken = null;
  }
}

async function graphGet<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="UTC"',
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Content request failed: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
}

function isVideoItem(name: string, mimeType: string | null): boolean {
  if (mimeType?.startsWith("video/")) {
    return true;
  }
  const lower = name.toLowerCase();
  return [".mp4", ".mkv", ".webm", ".mov", ".m4v", ".avi", ".wmv"].some((ext) =>
    lower.endsWith(ext),
  );
}

function mapDriveItem(item: GraphDriveItem): DriveFileItem | null {
  const id = item.id?.trim();
  if (!id) {
    return null;
  }
  const name = item.name?.trim() || "Untitled";
  const isFolder = Boolean(item.folder);
  const mimeType = item.file?.mimeType?.trim() ?? null;
  return {
    id,
    name,
    kind: isFolder ? "folder" : "file",
    mimeType,
    size: typeof item.size === "number" ? item.size : null,
    webUrl: item.webUrl ?? null,
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
    isVideo: !isFolder && isVideoItem(name, mimeType),
    createdDateTime: item.createdDateTime ?? null,
    lastModifiedDateTime: item.lastModifiedDateTime ?? null,
  };
}

async function listChildren(token: string, owner: string, folderId?: string | null) {
  const url = folderId
    ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
        owner,
      )}/drive/items/${encodeURIComponent(
        folderId,
      )}/children?$top=200&$select=id,name,webUrl,size,folder,file,createdDateTime,lastModifiedDateTime,@microsoft.graph.downloadUrl`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
        owner,
      )}/drive/root/children?$top=200&$select=id,name,webUrl,size,folder,file,createdDateTime,lastModifiedDateTime,@microsoft.graph.downloadUrl`;

  const items: DriveFileItem[] = [];
  let nextUrl: string | null = url;
  let pages = 0;
  while (nextUrl && pages < 10) {
    const page = await graphGet<GraphDriveChildrenResponse>(token, nextUrl);
    for (const raw of page.value ?? []) {
      const mapped = mapDriveItem(raw);
      if (mapped) {
        items.push(mapped);
      }
    }
    nextUrl = page["@odata.nextLink"] ?? null;
    pages += 1;
  }
  items.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return items;
}

/** Courses = folders under "Recordings" if present, otherwise root folders. */
export async function listOneDriveCourses(): Promise<{
  parentFolderId: string | null;
  parentFolderName: string;
  courses: DriveCourse[];
}> {
  const token = await getMicrosoftGraphAccessToken();
  const owner = getTargetMailbox();
  const rootItems = await listChildren(token, owner, null);
  const recordings = rootItems.find(
    (item) => item.kind === "folder" && item.name.trim().toLowerCase() === "recordings",
  );

  if (recordings) {
    const children = await listChildren(token, owner, recordings.id);
    return {
      parentFolderId: recordings.id,
      parentFolderName: recordings.name,
      courses: children
        .filter((item) => item.kind === "folder")
        .map((item) => ({ id: item.id, name: item.name, webUrl: item.webUrl })),
    };
  }

  return {
    parentFolderId: null,
    parentFolderName: "Courses",
    courses: rootItems
      .filter((item) => item.kind === "folder")
      .map((item) => ({ id: item.id, name: item.name, webUrl: item.webUrl })),
  };
}

export async function getOneDriveFolderMeta(folderId: string): Promise<DriveCourse> {
  const token = await getMicrosoftGraphAccessToken();
  const owner = getTargetMailbox();
  const meta = await graphGet<{ id?: string; name?: string; webUrl?: string }>(
    token,
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      owner,
    )}/drive/items/${encodeURIComponent(folderId)}?$select=id,name,webUrl`,
  );
  const id = meta.id?.trim();
  if (!id) {
    throw new Error("Folder not found");
  }
  return {
    id,
    name: meta.name?.trim() || "Course",
    webUrl: meta.webUrl ?? null,
  };
}

export async function listOneDriveFolderChildren(folderId: string): Promise<DriveFileItem[]> {
  const token = await getMicrosoftGraphAccessToken();
  const owner = getTargetMailbox();
  return listChildren(token, owner, folderId);
}

export async function getOneDriveFileContentResponse(
  itemId: string,
  rangeHeader?: string | null,
): Promise<Response> {
  const token = await getMicrosoftGraphAccessToken();
  const owner = getTargetMailbox();
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    owner,
  )}/drive/items/${encodeURIComponent(itemId)}/content`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }
  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok && response.status !== 206) {
    const text = await response.text();
    throw new Error(`Content request failed: ${response.status} ${text}`);
  }
  return response;
}
