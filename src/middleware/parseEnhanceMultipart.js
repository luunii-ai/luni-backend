import busboy from 'busboy';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * Parseia multipart do mesmo formato do front (image + tipo_procedimento repetido + regioes + intensidade + practice_profile opcional).
 * @param {import('express').Request} req
 */
export function parseEnhanceMultipart(req) {
  return new Promise((resolve, reject) => {
    const tipos = [];
    let regioes = '';
    let intensidade = '';
    let practiceProfile = '';
    let detalhes = '';
    /** @type {Buffer | null} */
    let fileBuffer = null;
    let filename = 'upload.jpg';
    let mime = 'image/jpeg';

    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_BYTES },
    });

    bb.on('file', (name, file, info) => {
      if (name !== 'image') {
        file.resume();
        return;
      }
      filename = info.filename || 'upload.jpg';
      mime = info.mimeType || 'image/jpeg';
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('limit', () => {
        file.resume();
        reject(new Error('Arquivo muito grande'));
      });
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('field', (name, val) => {
      if (name === 'tipo_procedimento' && val && String(val).trim()) {
        tipos.push(String(val).trim());
      } else if (name === 'regioes') {
        regioes = String(val ?? '');
      } else if (name === 'intensidade') {
        intensidade = String(val ?? '');
      } else if (name === 'practice_profile') {
        practiceProfile = String(val ?? '').trim();
      } else if (name === 'detalhes') {
        detalhes = String(val ?? '');
      }
    });

    bb.on('finish', () => {
      resolve({
        fileBuffer,
        filename,
        mime,
        tipos,
        regioes,
        intensidade,
        practiceProfile,
        detalhes,
      });
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
}
