import fs from 'fs';
import path from 'path';

const statusPath = path.join(process.cwd(), 'ADDTIONAL', 'autojpm_status.json');

export function ensureDirExists() {
  const dir = path.dirname(statusPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isBase64Image(str) {
  return typeof str === 'string' && (
    /^data:image\/[a-zA-Z]+;base64,/.test(str) || /^[A-Za-z0-9+/=]+\s*$/.test(str)
  );
}

function resolveToBase64(imagePath) {
  if (!imagePath) return '';
  if (isBase64Image(imagePath)) {
    if (imagePath.startsWith('data:image/')) return imagePath;
    return `data:image/png;base64,${imagePath}`;
  }
  const resolvedPath = path.resolve(imagePath);
  if (fs.existsSync(resolvedPath)) {
    const buffer = fs.readFileSync(resolvedPath);
    const ext = path.extname(resolvedPath).substring(1).toLowerCase() || 'png';
    return `data:image/${ext};base64,${buffer.toString('base64')}`;
  }
  return '';
}

export function saveAutoJPMStatus(isRunning, text = '', imagePath = '') {
  ensureDirExists();
  const imageBase64 = resolveToBase64(imagePath);
  fs.writeFileSync(statusPath, JSON.stringify({
    running: isRunning,
    text,
    imageBase64
  }, null, 2));
}

export function readAutoJPMStatus() {
  try {
    const data = fs.readFileSync(statusPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { running: false, text: '', imageBase64: '' };
  }
}