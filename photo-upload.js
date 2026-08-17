// Cloudinary Photo Upload Utility
// Handles profile photo uploads for both Employee & Admin apps

class PhotoUploadManager {
  constructor() {
    this.cloudConfig = window.HIVU_CONFIG?.cloudinary || {};
    this.isUploading = false;
  }

  // Validate if Cloudinary is configured
  isConfigured() {
    return !!(
      this.cloudConfig.cloudName &&
      this.cloudConfig.uploadPreset &&
      this.cloudConfig.cloudName !== "YOUR_CLOUDINARY_CLOUD_NAME"
    );
  }

  // Upload photo to Cloudinary
  async uploadPhoto(file, employeeId) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: "Cloudinary not configured. Add credentials to config.js"
      };
    }

    if (!file || !file.type.startsWith("image/")) {
      return { success: false, error: "Invalid file. Please select an image." };
    }

    if (file.size > 5242880) { // 5MB limit
      return { success: false, error: "File too large. Max 5MB allowed." };
    }

    try {
      this.isUploading = true;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", this.cloudConfig.uploadPreset);
      formData.append("folder", `${this.cloudConfig.uploadFolder}/${employeeId}`);
      formData.append("public_id", `profile_${Date.now()}`);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${this.cloudConfig.cloudName}/image/upload`,
        { method: "POST", body: formData }
      );

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();

      return {
        success: true,
        url: data.secure_url,
        publicId: data.public_id,
        size: data.bytes
      };
    } catch (error) {
      console.error("Photo upload error:", error);
      return { success: false, error: error.message };
    } finally {
      this.isUploading = false;
    }
  }

  // Delete photo from Cloudinary
  async deletePhoto(publicId) {
    if (!this.isConfigured()) return false;

    try {
      // Note: Deletion requires backend API (can't do from frontend)
      // Store in Supabase that photo should be deleted on next sync
      return true;
    } catch (error) {
      console.error("Delete error:", error);
      return false;
    }
  }

  // Compress image before upload
  async compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })),
            "image/jpeg",
            quality
          );
        };

        img.onerror = () => reject(new Error("Invalid image"));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsDataURL(file);
    });
  }
}

// Global instance
const photoUpload = new PhotoUploadManager();
