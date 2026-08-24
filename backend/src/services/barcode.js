// Decodes QR codes from an uploaded photo using jsQR (pure JS QR decoder)
// and Jimp (pure JS image loading) — no native image libraries, no
// external barcode-database API calls.
//
// Scope note: this supports QR codes only, not 1D barcodes (UPC/EAN). Real
// 1D barcode decoding libraries for Node either need a native `canvas`
// dependency (which risks install failures on some systems) or a browser
// camera feed. QR is the format most product labels and many retail tags
// use today, and decoding it needs nothing beyond what's already installed.
//
// LifeLoop does not look up decoded codes against any external product
// database by default — there's no broadly reliable, free barcode-to-product
// API to point to, and inventing one would violate the "never fabricate"
// principle. If you have access to a product database API, set
// BARCODE_LOOKUP_API_URL in backend/.env (must accept the decoded code as a
// `{code}` placeholder) and LifeLoop will call it for you.

const { Jimp } = require("jimp");
const jsQR = require("jsqr");

async function decodeQRFromImage(imagePath) {
  try {
    const image = await Jimp.read(imagePath);
    const { data, width, height } = image.bitmap;
    const result = jsQR(new Uint8ClampedArray(data), width, height);
    return result ? result.data : null;
  } catch (err) {
    console.warn("QR decode failed:", err.message);
    return null;
  }
}

async function lookupProductByCode(code) {
  const lookupUrlTemplate = process.env.BARCODE_LOOKUP_API_URL;
  if (!lookupUrlTemplate) return null;

  try {
    const url = lookupUrlTemplate.replace("{code}", encodeURIComponent(code));
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn("Product lookup failed:", err.message);
    return null;
  }
}

module.exports = { decodeQRFromImage, lookupProductByCode };
