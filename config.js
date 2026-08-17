window.HIVU_CONFIG = {
  // Live database (Supabase PostgreSQL)
  supabaseUrl: "https://kaiiffxgnpjsgswuhukj.supabase.co",
  supabaseKey: "sb_publishable_C-_YpbQRpxvU3l1pcUjIHg_rmDPGRnr",

  // Archive database (Firebase Firestore)
  firebase: {
    apiKey: "AIzaSyBU-NkCo2YAqxVYkhW8bz1xd67DS0S8zE",
    projectId: "hivu-archive",
    appId: "1:1042260712189:web:289ac25b949ddfdc679fab"
  },

  // Media storage (Cloudinary)
  cloudinary: {
    cloudName: "qdif2jto",
    uploadPreset: "hivu-hr-photos",
    uploadFolder: "hivu-hr-photos"
  },

  // Office location settings
  office: {
    lat: 28.7041,
    lng: 77.1025,
    radius: 500
  }
};
