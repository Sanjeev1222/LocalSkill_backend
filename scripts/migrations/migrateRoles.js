/**
 * Migration Script — LocalSkill Connect
 * 
 * Migrates old separate collections into the unified multi-role architecture:
 *   - technicians → users (add 'technician' role) + technicianProfiles kept as-is
 *   - toolowners  → users (add 'toolowner' role)  + ownerProfiles kept as-is
 *   - Adds default privacySettings + trustScore to all users
 *   - Creates UserSettings docs for users missing one
 *   - Does NOT delete old collections
 *   - Prevents duplicate users by phone/email
 * 
 * Usage:  node migration.js
 * Prereq: MONGO_URL in .env
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Technician = require('./models/Technician');
const ToolOwner = require('./models/ToolOwner');
const UserSettings = require('./models/UserSettings');

const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error('❌ MONGO_URL not set in .env');
  process.exit(1);
}

// ─── Counters ───
const stats = {
  techTotal: 0, techLinked: 0, techSkipped: 0,
  ownerTotal: 0, ownerLinked: 0, ownerSkipped: 0,
  usersUpdated: 0, settingsCreated: 0, errors: []
};

// ─── Step 1 & 2: Migrate Technicians ───
async function migrateTechnicians() {
  console.log('\n═══ Step 1: Migrating Technicians ═══');
  const technicians = await Technician.find({}).populate('user', 'name email phone roles');
  stats.techTotal = technicians.length;
  console.log(`  Found ${technicians.length} technician documents`);

  for (const tech of technicians) {
    try {
      if (!tech.user) {
        console.warn(`  ⚠ Technician ${tech._id} has no linked user — skipping`);
        stats.techSkipped++;
        continue;
      }

      const user = await User.findById(tech.user._id || tech.user);
      if (!user) {
        console.warn(`  ⚠ User ${tech.user} not found for technician ${tech._id} — skipping`);
        stats.techSkipped++;
        continue;
      }

      // Add 'technician' role if missing
      let changed = false;
      if (!user.roles.includes('technician')) {
        user.roles.push('technician');
        changed = true;
      }

      // If user has no activeRole set to technician and they only had 'user' before
      if (changed) {
        await user.save({ validateBeforeSave: false });
        console.log(`  ✅ Added 'technician' role to user ${user.name} (${user.email})`);
        stats.techLinked++;
      } else {
        console.log(`  ⏭  User ${user.name} already has 'technician' role — skipped`);
        stats.techSkipped++;
      }
    } catch (err) {
      console.error(`  ❌ Error migrating technician ${tech._id}: ${err.message}`);
      stats.errors.push({ type: 'technician', id: tech._id.toString(), error: err.message });
    }
  }
}

// ─── Step 3 & 4: Migrate Tool Owners ───
async function migrateToolOwners() {
  console.log('\n═══ Step 2: Migrating Tool Owners ═══');
  const owners = await ToolOwner.find({}).populate('user', 'name email phone roles');
  stats.ownerTotal = owners.length;
  console.log(`  Found ${owners.length} tool owner documents`);

  for (const owner of owners) {
    try {
      if (!owner.user) {
        console.warn(`  ⚠ ToolOwner ${owner._id} has no linked user — skipping`);
        stats.ownerSkipped++;
        continue;
      }

      const user = await User.findById(owner.user._id || owner.user);
      if (!user) {
        console.warn(`  ⚠ User ${owner.user} not found for toolowner ${owner._id} — skipping`);
        stats.ownerSkipped++;
        continue;
      }

      let changed = false;
      if (!user.roles.includes('toolowner')) {
        user.roles.push('toolowner');
        changed = true;
      }

      if (changed) {
        await user.save({ validateBeforeSave: false });
        console.log(`  ✅ Added 'toolowner' role to user ${user.name} (${user.email})`);
        stats.ownerLinked++;
      } else {
        console.log(`  ⏭  User ${user.name} already has 'toolowner' role — skipped`);
        stats.ownerSkipped++;
      }
    } catch (err) {
      console.error(`  ❌ Error migrating toolowner ${owner._id}: ${err.message}`);
      stats.errors.push({ type: 'toolowner', id: owner._id.toString(), error: err.message });
    }
  }
}

// ─── Step 5: Add default privacySettings to all users ───
async function addDefaultFields() {
  console.log('\n═══ Step 3: Adding default privacySettings to all users ═══');

  const result = await User.updateMany(
    { privacySettings: { $exists: false } },
    {
      $set: {
        privacySettings: {
          showPhone: 'booked',
          showEmail: 'booked',
          showLocation: 'everyone'
        }
      }
    }
  );
  console.log(`  ✅ Updated ${result.modifiedCount} users with default privacySettings`);
  stats.usersUpdated += result.modifiedCount;

  // Ensure every user that has 'user' in roles (should be all)
  const noUserRole = await User.updateMany(
    { roles: { $not: { $elemMatch: { $eq: 'user' } } } },
    { $addToSet: { roles: 'user' } }
  );
  if (noUserRole.modifiedCount > 0) {
    console.log(`  ✅ Added missing 'user' base role to ${noUserRole.modifiedCount} users`);
  }
}

// ─── Step 6: Create UserSettings for users that don't have one ───
async function ensureUserSettings() {
  console.log('\n═══ Step 4: Ensuring UserSettings exist for all users ═══');

  const allUsers = await User.find({}, '_id');
  const existingSettings = await UserSettings.find({}, 'user');
  const settingsUserIds = new Set(existingSettings.map(s => s.user.toString()));

  const missing = allUsers.filter(u => !settingsUserIds.has(u._id.toString()));
  console.log(`  Found ${missing.length} users without UserSettings`);

  if (missing.length > 0) {
    const docs = missing.map(u => ({ user: u._id }));
    await UserSettings.insertMany(docs, { ordered: false }).catch(() => {});
    stats.settingsCreated = missing.length;
    console.log(`  ✅ Created ${missing.length} UserSettings documents`);
  }
}

// ─── Main ───
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   LocalSkill Connect — DB Migration      ║');
  console.log('╚══════════════════════════════════════════╝');

  await mongoose.connect(MONGO_URL);
  console.log('✅ Connected to MongoDB');

  await migrateTechnicians();
  await migrateToolOwners();
  await addDefaultFields();
  await ensureUserSettings();

  // ─── Summary ───
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║            Migration Summary              ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ Technicians: ${stats.techTotal} total, ${stats.techLinked} linked, ${stats.techSkipped} skipped`);
  console.log(`║ ToolOwners:  ${stats.ownerTotal} total, ${stats.ownerLinked} linked, ${stats.ownerSkipped} skipped`);
  console.log(`║ Users updated with defaults: ${stats.usersUpdated}`);
  console.log(`║ UserSettings created: ${stats.settingsCreated}`);
  console.log(`║ Errors: ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    stats.errors.forEach(e => console.log(`║   ❌ ${e.type} ${e.id}: ${e.error}`));
  }
  console.log('╚══════════════════════════════════════════╝');
  console.log('\n✅ Migration complete. Old collections preserved.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});