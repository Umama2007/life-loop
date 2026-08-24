const cloudinary = require("cloudinary").v2;

// Cloudinary automatically picks up the CLOUDINARY_URL environment variable 
// for its configuration when using the v2 API.
if (!process.env.CLOUDINARY_URL) {
  console.warn("CLOUDINARY_URL is missing. Image uploads will fail.");
}

async function uploadBufferToCloudinary(buffer, folder = "lifeloop") {
  if (!process.env.CLOUDINARY_URL) {
    return `https://res.cloudinary.com/mock/image/upload/v1234567890/${folder}/mock_image.jpg`;
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBufferToCloudinary };
