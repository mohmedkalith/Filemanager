export type FileEntry = {
  uri: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modified?: number;
  hasName?: boolean;
};

export type FileKind = 'Folder' | 'Document' | 'Image' | 'Video' | 'Audio' | 'Archive' | 'Code' | 'Spreadsheet' | 'Other';

export function kindOf(entry: Pick<FileEntry, 'name' | 'isDirectory'>): FileKind {
  if (entry.isDirectory) return 'Folder';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'Image';
  if (['pdf', 'txt', 'md', 'doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'Document';
  if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) return 'Video';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'].includes(ext)) return 'Audio';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'Archive';
  if (['csv', 'tsv', 'xls', 'xlsx', 'ods'].includes(ext)) return 'Spreadsheet';
  if (['dart', 'js', 'ts', 'tsx', 'json', 'html', 'css', 'py', 'java', 'xml', 'yaml', 'yml', 'sh'].includes(ext)) return 'Code';
  return 'Other';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit++; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function extension(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

const audioExtensions = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus']);
const videoExtensions = new Set(['mp4', 'm4v', 'mov', '3gp', 'webm', 'mkv', 'avi', 'mpeg', 'mpg', 'wmv', 'flv']);
/** Classification is an attempt, not a guarantee the platform has a codec. */
export function mediaType(name: string): 'audio' | 'video' | null {
  const ext = extension(name);
  return audioExtensions.has(ext) ? 'audio' : videoExtensions.has(ext) ? 'video' : null;
}
