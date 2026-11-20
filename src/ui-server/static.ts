import { realpath, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

/**
 * Static assets of the web client (C001-COMP-019), served from one directory of the package with
 * fixed content types (C001-ADR-002 item 4). The server adds the Content-Security-Policy to every
 * response; the files carry no inline script or style, which the policy would block.
 */

/** The content types served; a file of any other extension is not served. */
export const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** The page served when the client has not been built into the asset directory yet. */
export const PLACEHOLDER_PAGE =
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<title>Review</title>\n</head>\n<body>\n<h1>Review</h1>\n' +
  '<p>The local review UI is running; its web client is not installed.</p>\n</body>\n</html>\n';

export interface StaticFile {
  readonly contentType: string;
  readonly body: Buffer;
}

/**
 * The relative path a request names, or null when it must be refused: any segment that is empty,
 * a dot segment, or holds a separator, a drive or stream colon, a control character, or a trailing
 * dot or space (Windows name quirks) after one round of percent-decoding.
 */
export function safeRelativePath(pathname: string): string[] | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(decoded)) return null;
  const segments = decoded.split('/').slice(1);
  if (segments.at(-1) === '') segments.pop();
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return null;
    if (/[:*?"<>|]/.test(segment) || /[. ]$/.test(segment)) return null;
  }
  return segments;
}

/** Serves files of one directory; it never leaves the directory, symbolic links included. */
export class StaticFiles {
  private rootReal: Promise<string | null> | undefined;

  constructor(private readonly root: string | undefined) {}

  private realRoot(): Promise<string | null> {
    this.rootReal ??= this.root
      ? realpath(resolve(this.root)).catch(() => null)
      : Promise.resolve(null);
    return this.rootReal;
  }

  private async read(segments: string[]): Promise<StaticFile | null> {
    const root = await this.realRoot();
    if (!root) return null;
    const contentType = CONTENT_TYPES[extname(segments.at(-1) ?? '').toLowerCase()];
    if (!contentType) return null;
    try {
      const real = await realpath(resolve(root, ...segments));
      if (!real.startsWith(root.endsWith(sep) ? root : root + sep)) return null;
      return { contentType, body: await readFile(real) };
    } catch {
      return null;
    }
  }

  /**
   * The file for a request path, or null for "not found". `/` is the page; a path that names no
   * file and has no extension is a client route and also gets the page. Refused paths get null
   * without the fallback.
   */
  async get(pathname: string): Promise<StaticFile | null> {
    const segments = safeRelativePath(pathname);
    if (segments === null) return null;
    if (segments[0]?.toLowerCase() === 'api') return null;
    if (segments.length === 0) return (await this.read(['index.html'])) ?? placeholder();
    const file = await this.read(segments);
    if (file) return file;
    const last = segments.at(-1) ?? '';
    return last.includes('.') ? null : ((await this.read(['index.html'])) ?? placeholder());
  }
}

function placeholder(): StaticFile {
  return { contentType: CONTENT_TYPES['.html']!, body: Buffer.from(PLACEHOLDER_PAGE, 'utf8') };
}
