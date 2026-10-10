// Prepare camera photographs for field reporting without installing a mobile app.
// HEIC/HEIF images are decoded by the browser when supported and converted to JPEG.
// Large photographs are resized before upload to conserve mobile data and database space.
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CAMERA_TYPES = new Set([...TYPES, 'image/heic', 'image/heif']);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_BYTES = 35 * 1024 * 1024;
const RESIZE_THRESHOLD = 2.5 * 1024 * 1024;

function canProcess(file) {
  return CAMERA_TYPES.has(file.type.toLowerCase()) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

function loadImageFallback(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This phone photo format is not supported by your browser. Choose a JPEG or PNG.'));
    };
    image.src = url;
  });
}

async function convertToJpeg(file) {
  let bitmap;
  try {
    bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await loadImageFallback(file);
  } catch {
    bitmap = await loadImageFallback(file);
  }
  try {
    const originalWidth = bitmap.width || bitmap.naturalWidth;
    const originalHeight = bitmap.height || bitmap.naturalHeight;
    if (!originalWidth || !originalHeight) throw new Error('The photo has invalid dimensions.');
    const scale = Math.min(1, 1800 / Math.max(originalWidth, originalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(originalWidth * scale));
    canvas.height = Math.max(1, Math.round(originalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare this photo.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob;
    for (const quality of [0.82, 0.7, 0.55]) {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
    }
    if (!blob || !blob.size || blob.size > MAX_UPLOAD_BYTES) {
      throw new Error('The image is too large after resizing. Select a smaller picture.');
    }
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    if (bitmap?.close) bitmap.close();
  }
}

export async function prepareFieldPhoto(file) {
  if (!file || !canProcess(file)) {
    throw new Error('Select a JPEG, PNG, WebP, or iPhone HEIC photo.');
  }
  if (file.size === 0 || file.size > MAX_INPUT_BYTES) {
    throw new Error('The selected photo is empty or exceeds 35 MB.');
  }
  if (TYPES.has(file.type) && file.size <= RESIZE_THRESHOLD) return file;
  try {
    return await convertToJpeg(file);
  } catch (error) {
    if (TYPES.has(file.type) && file.size <= MAX_UPLOAD_BYTES) return file;
    throw error;
  }
}
