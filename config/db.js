const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ MongoDB Connected Successfully");

    // Drop stale indexes from schema migrations
    try {
      const videoCallColl = mongoose.connection.collection('videocalls');
      await videoCallColl.dropIndex('roomId_1');
      console.log('✅ Dropped stale roomId_1 index from videocalls');
    } catch (e) {
      // Index doesn't exist — safe to ignore
      if (e.code !== 27) console.warn('Index drop warning:', e.message);
    }
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;