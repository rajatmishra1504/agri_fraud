const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a file to Cloudinary
 * @param {string} filePath - Local path to the file
 * @param {string} folder - Folder name in Cloudinary
 * @returns {Promise<string>} - The secure URL of the uploaded file
 */
const uploadToCloudinary = async (filePath, folder = 'certificates') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `agri_fraud/${folder}`,
      resource_type: 'auto'
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    throw error;
  }
};

module.exports = { uploadToCloudinary, cloudinary };
