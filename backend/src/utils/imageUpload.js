// Shared image-upload validation, used by both the items and community
// routes (previously duplicated in each file).
//
// multer's fileFilter only checks the Content-Type header the client sent
// with the upload — an attacker can label any file as "image/png" and it
// will pass that check. This middleware runs after multer has saved the
// file to disk and verifies the bytes are actually decodable as an image
// (using Jimp, already a dependency for QR decoding), rejecting and
// deleting anything that isn't a genuine image.

const fs = require("fs");
const { Jimp } = require("jimp");
const { sendError } = require("./errors");

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function imageFileFilter(req, file, cb) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(new Error("Only JPEG, PNG, WEBP, or GIF images are allowed."));
  cb(null, true);
}

// Collects every uploaded file's path from any multer shape (.single,
// .array, or .fields) into a flat list.
function collectUploadedFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === "object") return Object.values(req.files).flat();
  return [];
}

// Express middleware: place after any multer upload middleware. Verifies
// every uploaded file is a genuine, decodable image; deletes and rejects
// the request with a clean error if not.
async function verifyUploadedImages(req, res, next) {
  const files = collectUploadedFiles(req);
  if (!files.length) return next();

  for (const file of files) {
    try {
      await Jimp.read(file.path);
    } catch {
      // Clean up every file from this request, not just the bad one, so we
      // don't leave orphaned uploads behind.
      for (const f of files) fs.unlink(f.path, () => {});
      return sendError(res, 400, "INVALID_IMAGE", "One of the uploaded files isn't a valid image.");
    }
  }
  next();
}

module.exports = { ALLOWED_IMAGE_TYPES, imageFileFilter, verifyUploadedImages };
