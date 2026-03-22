/**
 * Profile Migration Script — LocalSkill Connect
 * 
 * Migrates old collections to the new profile-based architecture:
 *   1. Copies `technicians` → `technicianprofiles` (renames `user` → `userId`)
 *   2. Copies `toolowners` → `ownerprofiles` (renames `user` → `userId`, merges OwnerSettings)
 *   3. Renames old collections to `*_backup`
 *   4. Renames `techniciansettings` → `techniciansettings_backup`
 *   5. Renames `ownersettings` → `ownersettings_backup`
 * 
 * Safe to run multiple times — skips steps if target collections already exist.
 * 
 * Usage:  node migrate-profiles.js
 * Prereq: MONGO_URL in .env
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error('❌ MONGO_URL not set in .env');
  process.exit(1);
}

async function collectionExists(db, name) {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   LocalSkill Connect — Profile Migration     ║');
  console.log('╚══════════════════════════════════════════════╝');

  await mongoose.connect(MONGO_URL);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ─── Step 1: Migrate technicians → technicianprofiles ───
  console.log('═══ Step 1: Migrate technicians → technicianprofiles ═══');

  const techProfileCount = await collectionExists(db, 'technicianprofiles')
    ? await db.collection('technicianprofiles').countDocuments()
    : 0;

  if (techProfileCount > 0) {
    console.log(`  ⏭  technicianprofiles already has ${techProfileCount} docs — skipping`);
  } else if (await collectionExists(db, 'technicians') || await collectionExists(db, 'technicians_backup')) {
    const sourceCollection = (await collectionExists(db, 'technicians')) ? 'technicians' : 'technicians_backup';
    const technicians = await db.collection(sourceCollection).find({}).toArray();
    console.log(`  Found ${technicians.length} technician documents (from ${sourceCollection})`);

    if (technicians.length > 0) {
      const profiles = technicians.map(doc => {
        const { user, _id, ...rest } = doc;
        return { _id, userId: user, ...rest };
      });
      await db.collection('technicianprofiles').insertMany(profiles);
      console.log(`  ✅ Created ${profiles.length} technicianprofile documents`);
    }
  } else {
    console.log('  ⚠ No technicians collection found — nothing to migrate');
  }

  // ─── Step 2: Migrate toolowners → ownerprofiles (merge OwnerSettings) ───
  console.log('\n═══ Step 2: Migrate toolowners → ownerprofiles ═══');

  const ownerProfileCount = await collectionExists(db, 'ownerprofiles')
    ? await db.collection('ownerprofiles').countDocuments()
    : 0;

  if (ownerProfileCount > 0) {
    console.log(`  ⏭  ownerprofiles already has ${ownerProfileCount} docs — skipping`);
  } else if (await collectionExists(db, 'toolowners') || await collectionExists(db, 'toolowners_backup')) {
    const ownerSource = (await collectionExists(db, 'toolowners')) ? 'toolowners' : 'toolowners_backup';
    const toolowners = await db.collection(ownerSource).find({}).toArray();
    console.log(`  Found ${toolowners.length} toolowner documents (from ${ownerSource})`);

    // Load OwnerSettings for merging
    let settingsMap = new Map();
    const settingsSource = (await collectionExists(db, 'ownersettings')) ? 'ownersettings'
      : (await collectionExists(db, 'ownersettings_backup')) ? 'ownersettings_backup' : null;
    if (settingsSource) {
      const settings = await db.collection(settingsSource).find({}).toArray();
      for (const s of settings) {
        if (s.owner) settingsMap.set(s.owner.toString(), s);
      }
      console.log(`  Found ${settings.length} ownersettings to merge`);
    }

    if (toolowners.length > 0) {
      const profiles = toolowners.map(doc => {
        const { user, _id, ...rest } = doc;
        const profile = { _id, userId: user, ...rest };

        // Merge OwnerSettings fields if available
        const ownerSettings = settingsMap.get(_id.toString());
        if (ownerSettings) {
          if (ownerSettings.defaultPricing) profile.defaultPricing = ownerSettings.defaultPricing;
          if (ownerSettings.lateFeePerHour != null) profile.lateFeePerHour = ownerSettings.lateFeePerHour;
          if (ownerSettings.depositRequired != null) profile.depositRequired = ownerSettings.depositRequired;
          if (ownerSettings.insuranceEnabled != null) profile.insuranceEnabled = ownerSettings.insuranceEnabled;
        }

        return profile;
      });
      await db.collection('ownerprofiles').insertMany(profiles);
      console.log(`  ✅ Created ${profiles.length} ownerprofile documents`);
    }
  } else {
    console.log('  ⚠ No toolowners collection found — nothing to migrate');
  }

  // ─── Step 3: Rename old collections to backups ───
  console.log('\n═══ Step 3: Rename old collections to backups ═══');

  const renames = [
    ['technicians', 'technicians_backup'],
    ['toolowners', 'toolowners_backup'],
    ['techniciansettings', 'techniciansettings_backup'],
    ['ownersettings', 'ownersettings_backup']
  ];

  for (const [oldName, newName] of renames) {
    if (!(await collectionExists(db, oldName))) {
      console.log(`  ⏭  ${oldName} does not exist — skipping`);
      continue;
    }
    if (await collectionExists(db, newName)) {
      console.log(`  ⏭  ${newName} already exists — skipping rename of ${oldName}`);
      continue;
    }
    await db.collection(oldName).rename(newName);
    console.log(`  ✅ Renamed ${oldName} → ${newName}`);
  }

  // ─── Step 4: Create indexes on new collections ───
  console.log('\n═══ Step 4: Create indexes ═══');

  if (await collectionExists(db, 'technicianprofiles')) {
    const coll = db.collection('technicianprofiles');
    await coll.createIndex({ userId: 1 }, { unique: true });
    await coll.createIndex({ 'skills': 1 });
    await coll.createIndex({ 'rating.average': -1 });
    await coll.createIndex({ isVerified: 1, 'availability.isOnline': 1 });
    await coll.createIndex({ skills: 1, 'rating.average': -1, isVerified: 1 });
    console.log('  ✅ Indexes created on technicianprofiles');
  }

  if (await collectionExists(db, 'ownerprofiles')) {
    const coll = db.collection('ownerprofiles');
    await coll.createIndex({ userId: 1 }, { unique: true });
    await coll.createIndex({ 'rating.average': -1 });
    console.log('  ✅ Indexes created on ownerprofiles');
  }

  // ─── Summary ───
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║          Profile Migration Complete           ║');
  console.log('╠══════════════════════════════════════════════╣');

  for (const name of ['technicianprofiles', 'ownerprofiles']) {
    if (await collectionExists(db, name)) {
      const count = await db.collection(name).countDocuments();
      console.log(`║  ${name}: ${count} documents`);
    }
  }

  for (const name of ['technicians_backup', 'toolowners_backup', 'techniciansettings_backup', 'ownersettings_backup']) {
    if (await collectionExists(db, name)) {
      const count = await db.collection(name).countDocuments();
      console.log(`║  ${name}: ${count} documents (backup)`);
    }
  }

  console.log('╚══════════════════════════════════════════════╝');
  console.log('\n✅ Profile migration complete.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
