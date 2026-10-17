import { encodeId } from '../client.js';
import { toFormData } from '../files.js';

export class Templates {
  constructor(http) { this.http = http; }

  // query: { waNumberId, status }
  list(query, opts) { return this.http.get('/templates', query, opts); }
  get(id, opts) { return this.http.get(`/templates/${encodeId(id)}`, undefined, opts); }
  create(data, opts) { return this.http.post('/templates', data, opts); }
  update(id, data, opts) { return this.http.put(`/templates/${encodeId(id)}`, data, opts); }
  delete(id, opts) { return this.http.delete(`/templates/${encodeId(id)}`, opts); }
  duplicate(id, opts) { return this.http.post(`/templates/${encodeId(id)}/duplicate`, undefined, opts); }
  restore(id, opts) { return this.http.post(`/templates/${encodeId(id)}/restore`, undefined, opts); }

  // Pulls the latest templates and their review status from Meta.
  sync({ waNumberId } = {}, opts) {
    return this.http.post('/templates/sync', waNumberId ? { waNumberId } : undefined, opts);
  }

  library(query, opts) { return this.http.get('/templates/library', query, opts); }
  installFromLibrary(libId, data, opts) {
    return this.http.post(`/templates/library/${encodeId(libId)}/install`, data, opts);
  }

  // Uploads a header image / video / document sample. Returns the handle to put
  // in the template's HEADER component. `file` is a path, Buffer or Blob.
  async uploadMedia(file, { filename, contentType, ...opts } = {}) {
    const form = await toFormData(file, { filename, contentType });
    return this.http.upload('/templates/media', form, opts);
  }

  // Resolves to a Buffer with the stored header media.
  getMedia(assetId, opts) {
    return this.http.get(`/templates/media/${encodeId(assetId)}`, undefined, opts);
  }
}
