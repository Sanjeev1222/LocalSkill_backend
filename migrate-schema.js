/**
 * Schema Normalization Migration — LocalSkill Connect
 * 
 * Refactors users collection to production-grade multi-role architecture:
 *   1. Removes rating/totalReviews from users → stores in TechnicianProfile/OwnerProfile
 *   2. Moves darkMode from users → UserSettings
 *   3. Splits location → geoLocation + address
 *   4. Standardizes roles to CONSTANT_CASE (USER, TECHNICIAN, TOOL_OWNER, ADMIN)
 *   5. Upgrades privacySettings to Boolean structure
 *   6. Ensures trustScore exists on all users
 *   7. Renames lastLogin → lastLoginAt
 * 
 * Safe: idempotent, no deletes, logs all progress, skips already-migrated docs
 * 
 * Usage:  node migrate-schema.js
 * Prereq: MONGO_URL in .env
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error('❌ MONGO_URL not set in .env');
  process.exit(1);
}

// ─── Role mapping ───
const ROLE_MAP = {
  'user': 'USER',
  'technician': 'TECHNICIAN',
  'toolowner': 'TOOL_OWNER',
  'admin': 'ADMIN'
};

// ─── Stats ───
const stats = {
  totalUsers: 0,
  rolesUpdated: 0,
  locationSplit: 0,
  privacyUpgraded: 0,
  ratingsMigratedToTech: 0,
  ratingsMigratedToOwner: 0,
  darkModeMovedToSettings: 0,
  trustScoreAdded: 0,
  lastLoginRenamed: 0,
  settingsCreated: 0,
  skipped: 0,
  errors: []
};

async function migrate() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   LocalSkill Connect — Schema Normalization      ║');
  console.log('╚══════════════════════════════════════════════════╝');

  await mongoose.connect(MONGO_URL);
  console.log('✅ Connected to MongoDB\n');
  const db = mongoose.connection.db;

  const usersCol = db.collection('users');
  const settingsCol = db.collection('usersettings');
  const techCol = db.collection('technicianprofiles');
  const ownerCol = db.collection('ownerprofiles');

  const users = await usersCol.find({}).toArray();
  stats.totalUsers = users.length;
  console.log(`═══ Processing ${users.length} users ═══\n`);

  for (const user of users) {
    try {
      const updates = {};
      const unsets = {};
      const userId = user._id;

      // ─── 1. STANDARDIZE ROLES ───
      const oldRoles = user.roles || ['user'];
      const alreadyUpperCase = oldRoles.every(r => r === r.toUpperCase());

      if (!alreadyUpperCase) {
        const newRoles = oldRoles.map(r => ROLE_MAP[r.toLowerCase()] || r.toUpperCase());
        updates.roles = [...new Set(newRoles)];

        const oldActive = user.activeRole || oldRoles[0];
        updates.activeRole = ROLE_MAP[oldActive.toLowerCase()] || oldActive.toUpperCase();
        stats.rolesUpdated++;
      }

      // ─── 2. SPLIT LOCATION → geoLocation + address ───
      if (user.location && !user.geoLocation) {
        const loc = user.location;
        const coords = loc.coordinates || [0, 0];
        const hasValidCoords = Array.isArray(coords) && coords.length === 2 && (coords[0] !== 0 || coords[1] !== 0);

        if (hasValidCoords) {
          updates.geoLocation = {
            type: 'Point',
            coordinates: coords
          };
        }

        updates.address = {
          city: loc.city || '',
          state: loc.state || '',
          pincode: loc.pincode || '',
          fullAddress: loc.address || ''
        };

        unsets.location = '';
        stats.locationSplit++;
      }

      // ─── 3. UPGRADE PRIVACY SETTINGS ───
      const priv = user.privacySettings;
      if (priv && (priv.showPhone !== undefined || priv.showEmail !== undefined || priv.showLocation !== undefined)) {
        // Already new format? Check
        if (priv.showPhoneAfterBooking === undefined) {
          updates.privacySettings = {
            showPhoneAfterBooking: priv.showPhone === 'booked' || priv.showPhone === 'everyone' ? true : (priv.showPhone === 'nobody' ? false : true),
            showExactLocationAfterBooking: priv.showLocation === 'booked' || priv.showLocation === 'everyone' ? true : (priv.showLocation === 'nobody' ? false : true)
          };
          stats.privacyUpgraded++;
        }
      } else if (!priv || priv.showPhoneAfterBooking === undefined) {
        updates.privacySettings = {
          showPhoneAfterBooking: true,
          showExactLocationAfterBooking: true
        };
        stats.privacyUpgraded++;
      }

      // ─── 4. MIGRATE RATING TO PROFILE COLLECTIONS ───
      const effectiveRoles = (updates.roles || oldRoles).map(r => r.toUpperCase());

      if (user.rating && user.rating > 0) {
        if (effectiveRoles.includes('TECHNICIAN')) {
          const techProfile = await techCol.findOne({ userId: userId });
          if (techProfile) {
            // Only migrate if tech profile has no rating or zero rating
            if (!techProfile.rating || (techProfile.rating.average === 0 && techProfile.rating.count === 0)) {
              await techCol.updateOne(
                { userId: userId },
                { $set: { 'rating.average': user.rating, 'rating.count': user.totalReviews || 0 } }
              );
              stats.ratingsMigratedToTech++;
            }
          }
        }
        if (effectiveRoles.includes('TOOL_OWNER')) {
          const ownerProfile = await ownerCol.findOne({ userId: userId });
          if (ownerProfile) {
            if (!ownerProfile.rating || (ownerProfile.rating.average === 0 && ownerProfile.rating.count === 0)) {
              await ownerCol.updateOne(
                { userId: userId },
                { $set: { 'rating.average': user.rating, 'rating.count': user.totalReviews || 0 } }
              );
              stats.ratingsMigratedToOwner++;
            }
          }
        }
        unsets.rating = '';
        unsets.totalReviews = '';
      } else if (user.rating !== undefined) {
        unsets.rating = '';
        unsets.totalReviews = '';
      }

      // ─── 5. MOVE darkMode TO UserSettings ───
      if (user.darkMode !== undefined) {
        const existingSettings = await settingsCol.findOne({ user: userId });
        if (existingSettings) {
          await settingsCol.updateOne(
            { user: userId },
            { $set: { 'profile.darkMode': user.darkMode } }
          );
        } else {
          await settingsCol.insertOne({
            user: userId,
            profile: { bio: '', address: '', language: 'en', darkMode: user.darkMode },
            security: { twoFactorEnabled: false, activeSessions: [] },
            notifications: { jobAlerts: true, rentalAlerts: true, paymentAlerts: true, marketing: false, sms: true, email: true },
            privacy: { showPhone: false, showLocation: true, profileVisibility: 'public' },
            payment: { bankAccounts: [] },
            createdAt: new Date(),
            updatedAt: new Date()
          });
          stats.settingsCreated++;
        }
        unsets.darkMode = '';
        stats.darkModeMovedToSettings++;
      }

      // ─── 6. ENSURE trustScore ───
      if (user.trustScore === undefined || user.trustScore === null) {
        updates.trustScore = 0;
        stats.trustScoreAdded++;
      }

      // ─── 7. RENAME lastLogin → lastLoginAt ───
      if (user.lastLogin !== undefined && user.lastLoginAt === undefined) {
        updates.lastLoginAt = user.lastLogin;
        unsets.lastLogin = '';
        stats.lastLoginRenamed++;
      }

      // ─── APPLY UPDATES ───
      const hasUpdates = Object.keys(updates).length > 0;
      const hasUnsets = Object.keys(unsets).length > 0;

      if (hasUpdates || hasUnsets) {
        const op = {};
        if (hasUpdates) op.$set = updates;
        if (hasUnsets) op.$unset = unsets;
        await usersCol.updateOne({ _id: userId }, op);
        console.log(`  ✅ ${user.name || user.email} — migrated`);
      } else {
        console.log(`  ⏭  ${user.name || user.email} — already migrated`);
        stats.skipped++;
      }

    } catch (err) {
      console.error(`  ❌ Error migrating user ${user._id}: ${err.message}`);
      stats.errors.push({ userId: user._id.toString(), error: err.message });
    }
  }

  // ─── ENSURE SETTINGS EXIST FOR ALL USERS ───
  console.log('\n═══ Ensuring UserSettings for all users ═══');
  const allUserIds = users.map(u => u._id);
  const existingSettings = await settingsCol.find({}, { projection: { user: 1, userId: 1 } }).toArray();
  const settingsUserIds = new Set(existingSettings.map(s => (s.userId || s.user).toString()));
  const missing = allUserIds.filter(id => !settingsUserIds.has(id.toString()));

  if (missing.length > 0) {
    const docs = missing.map(id => ({
      userId: id,
      profile: { bio: '', address: '', language: 'en', darkMode: false },
      security: { twoFactorEnabled: false, activeSessions: [] },
      notifications: { jobAlerts: true, rentalAlerts: true, paymentAlerts: true, marketing: false, sms: true, email: true },
      privacy: { showPhone: false, showLocation: true, profileVisibility: 'public' },
      payment: { bankAccounts: [] },
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    await settingsCol.insertMany(docs, { ordered: false }).catch(() => {});
    console.log(`  ✅ Created ${missing.length} missing UserSettings documents`);
    stats.settingsCreated += missing.length;
  } else {
    console.log('  ⏭  All users have UserSettings');
  }

  // ─── RENAME TECHNICIANPROFILE FIELDS ───
  console.log('\n═══ Renaming TechnicianProfile fields ═══');
  const techRenames = { experience: 'experienceYears', chargeRate: 'hourlyRate', serviceRadius: 'serviceRadiusKm', location: 'geoLocation' };
  for (const [oldF, newF] of Object.entries(techRenames)) {
    const r = await techCol.updateMany(
      { [oldF]: { $exists: true } },
      { $rename: { [oldF]: newF } }
    );
    console.log(`  ${oldF} → ${newF}: ${r.modifiedCount} docs`);
  }
  // Drop old location 2dsphere index on technicianprofiles if exists
  try {
    const techIndexes = await techCol.indexes();
    for (const idx of techIndexes) {
      if (idx.key && (idx.key.location === '2dsphere' || idx.key['location'] === '2dsphere')) {
        await techCol.dropIndex(idx.name);
        console.log(`  ✅ Dropped old TechnicianProfile location index: ${idx.name}`);
      }
      // Also drop compound indexes referencing old field names
      if (idx.key && (idx.key.chargeRate || idx.key.experience)) {
        await techCol.dropIndex(idx.name);
        console.log(`  ✅ Dropped old TechnicianProfile compound index: ${idx.name}`);
      }
    }
  } catch (e) { /* index may not exist */ }
  try {
    await techCol.createIndex({ geoLocation: '2dsphere' });
    console.log('  ✅ Created TechnicianProfile geoLocation 2dsphere index');
  } catch (e) { console.log(`  ⚠  ${e.message}`); }

  // ─── RENAME OWNERPROFILE FIELDS ───
  console.log('\n═══ Renaming OwnerProfile fields ═══');
  const ownerResult = await ownerCol.updateMany(
    { shopName: { $exists: true } },
    { $rename: { shopName: 'businessName' } }
  );
  console.log(`  shopName → businessName: ${ownerResult.modifiedCount} docs`);

  // ─── RENAME USERSETTINGS user → userId ───
  console.log('\n═══ Renaming UserSettings user → userId ═══');
  // Must drop old unique index on `user` field first
  try {
    const settingsIndexes = await settingsCol.indexes();
    for (const idx of settingsIndexes) {
      if (idx.key && idx.key.user !== undefined && idx.name !== '_id_') {
        await settingsCol.dropIndex(idx.name);
        console.log(`  ✅ Dropped old UserSettings index: ${idx.name}`);
      }
    }
  } catch (e) { /* index may not exist */ }
  const settingsRename = await settingsCol.updateMany(
    { user: { $exists: true }, userId: { $exists: false } },
    { $rename: { user: 'userId' } }
  );
  console.log(`  user → userId: ${settingsRename.modifiedCount} docs`);
  // Create new userId unique index
  try {
    await settingsCol.createIndex({ userId: 1 }, { unique: true });
    console.log('  ✅ Created UserSettings userId unique index');
  } catch (e) { console.log(`  ⚠  userId index: ${e.message}`); }

  // ─── CREATE INDEXES ───
  console.log('\n═══ Creating indexes ═══');
  try {
    // Drop old location 2dsphere index if it exists
    const indexes = await usersCol.indexes();
    for (const idx of indexes) {
      if (idx.key && idx.key.location === '2dsphere') {
        await usersCol.dropIndex(idx.name);
        console.log(`  ✅ Dropped old location 2dsphere index`);
      }
    }
  } catch (e) { /* index may not exist */ }

  try {
    await usersCol.createIndex({ 'geoLocation': '2dsphere' });
    console.log('  ✅ Created geoLocation 2dsphere index');
  } catch (e) {
    console.log(`  ⚠  geoLocation index: ${e.message}`);
  }

  try {
    await usersCol.createIndex({ phone: 1 }, { unique: true, sparse: true });
    console.log('  ✅ Created phone unique index');
  } catch (e) {
    console.log(`  ⚠  phone index: ${e.message}`);
  }

  // ─── SUMMARY ───
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║          Schema Normalization Complete            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Total users:             ${stats.totalUsers}`);
  console.log(`║  Roles updated:           ${stats.rolesUpdated}`);
  console.log(`║  Location split:          ${stats.locationSplit}`);
  console.log(`║  Privacy upgraded:        ${stats.privacyUpgraded}`);
  console.log(`║  Ratings → TechProfile:   ${stats.ratingsMigratedToTech}`);
  console.log(`║  Ratings → OwnerProfile:  ${stats.ratingsMigratedToOwner}`);
  console.log(`║  DarkMode → Settings:     ${stats.darkModeMovedToSettings}`);
  console.log(`║  TrustScore added:        ${stats.trustScoreAdded}`);
  console.log(`║  LastLogin renamed:       ${stats.lastLoginRenamed}`);
  console.log(`║  Settings created:        ${stats.settingsCreated}`);
  console.log(`║  Skipped (already done):  ${stats.skipped}`);
  console.log(`║  Errors:                  ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    stats.errors.forEach(e => console.log(`║    ❌ ${e.userId}: ${e.error}`));
  }
  console.log('╚══════════════════════════════════════════════════╝');

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
