import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

// Upload endpoints take one multipart `file`. Accept what callers usually have:
// a path on disk, a Buffer / Uint8Array, or a Blob / File.
export async function toFormData(file, { filename, contentType } = {}) {
  let blob;
  let name = filename;
  if (typeof file === 'string') {
    blob = new Blob([await readFile(file)], contentType ? { type: contentType } : undefined);
    name ??= basename(file);
  } else if (file instanceof Blob) {
    blob = contentType && !file.type ? new Blob([file], { type: contentType }) : file;
    name ??= file.name;
  } else if (file instanceof Uint8Array || file instanceof ArrayBuffer) {
    blob = new Blob([file], contentType ? { type: contentType } : undefined);
  } else {
    throw new TypeError('file must be a path, Buffer, Uint8Array, ArrayBuffer or Blob');
  }
  if (!name) throw new TypeError('A filename is required when uploading a Buffer: pass { filename }');

  const form = new FormData();
  form.append('file', blob, name);
  return form;
}
