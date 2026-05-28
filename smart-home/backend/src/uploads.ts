import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
export const FLOORPLAN_DIR = path.join(UPLOAD_ROOT, 'floorplans');
export const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
fs.mkdirSync(FLOORPLAN_DIR, { recursive: true });
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2 MB — avatars don't need to be big

export const floorplanUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, FLOORPLAN_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.png').toLowerCase();
      cb(null, `room-${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Дозволені формати: PNG / JPEG / WebP'));
  },
  limits: { fileSize: MAX_SIZE },
});

export const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.png').toLowerCase();
      cb(null, `user-${req.user!.sub}-${Date.now()}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('Дозволені формати: PNG / JPEG / WebP'));
  },
  limits: { fileSize: AVATAR_MAX_SIZE },
});

export function removeUploadedFile(publicUrl: string | null | undefined) {
  if (!publicUrl) return;
  // publicUrl is `/uploads/floorplans/<name>`; resolve to absolute path safely.
  const rel = publicUrl.replace(/^\/uploads\//, '');
  const abs = path.join(UPLOAD_ROOT, rel);
  if (!abs.startsWith(UPLOAD_ROOT)) return; // path traversal guard
  fs.promises.unlink(abs).catch(() => {});
}
