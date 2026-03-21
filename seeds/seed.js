require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Technician = require('../models/Technician');
const ToolOwner = require('../models/ToolOwner');
const Tool = require('../models/Tool');
const Booking = require('../models/Booking');
const Rental = require('../models/Rental');
const Review = require('../models/Review');
const Payment = require('../models/Payment');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/localskill_connect';

const seedData = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    await Promise.all([
      User.deleteMany({}), Technician.deleteMany({}),
      ToolOwner.deleteMany({}), Tool.deleteMany({}),
      Booking.deleteMany({}), Rental.deleteMany({}),
      Review.deleteMany({}), Payment.deleteMany({})
    ]);
    console.log('Cleared existing data');

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@localskill.com',
      password: 'admin123',
      phone: '9999999999',
      role: 'admin',
      isVerified: true,
      location: {
        type: 'Point',
        coordinates: [77.2090, 28.6139],
        address: '123 Admin Street',
        city: 'New Delhi',
        state: 'Delhi'
      }
    });
    console.log('Admin created: admin@localskill.com / admin123');

    const users = await User.create([
      {
        name: 'Rahul Sharma', email: 'rahul@test.com', password: 'password123',
        phone: '9876543210', role: 'user',
        location: { type: 'Point', coordinates: [77.2167, 28.6358], address: 'Connaught Place', city: 'New Delhi', state: 'Delhi' }
      },
      {
        name: 'Priya Patel', email: 'priya@test.com', password: 'password123',
        phone: '9876543211', role: 'user',
        location: { type: 'Point', coordinates: [72.8777, 19.0760], address: 'Andheri West', city: 'Mumbai', state: 'Maharashtra' }
      },
      {
        name: 'Amit Kumar', email: 'amit@test.com', password: 'password123',
        phone: '9876543212', role: 'user',
        location: { type: 'Point', coordinates: [77.5946, 12.9716], address: 'Koramangala', city: 'Bangalore', state: 'Karnataka' }
      }
    ]);
    console.log('Users created');

    const techUsers = await User.create([
      {
        name: 'Vikram Singh', email: 'vikram@tech.com', password: 'password123',
        phone: '9876543220', role: 'technician', isVerified: true,
        location: { type: 'Point', coordinates: [77.2295, 28.6129], address: 'Lajpat Nagar', city: 'New Delhi', state: 'Delhi' }
      },
      {
        name: 'Suresh Reddy', email: 'suresh@tech.com', password: 'password123',
        phone: '9876543221', role: 'technician', isVerified: true,
        location: { type: 'Point', coordinates: [77.2090, 28.6339], address: 'Karol Bagh', city: 'New Delhi', state: 'Delhi' }
      },
      {
        name: 'Manoj Tiwari', email: 'manoj@tech.com', password: 'password123',
        phone: '9876543222', role: 'technician', isVerified: true,
        location: { type: 'Point', coordinates: [72.8557, 19.0550], address: 'Bandra', city: 'Mumbai', state: 'Maharashtra' }
      },
      {
        name: 'Rajesh Kumar', email: 'rajesh@tech.com', password: 'password123',
        phone: '9876543223', role: 'technician',
        location: { type: 'Point', coordinates: [77.5800, 12.9500], address: 'HSR Layout', city: 'Bangalore', state: 'Karnataka' }
      },
      {
        name: 'Deepak Verma', email: 'deepak@tech.com', password: 'password123',
        phone: '9876543224', role: 'technician', isVerified: true,
        location: { type: 'Point', coordinates: [77.2300, 28.6500], address: 'Rohini', city: 'New Delhi', state: 'Delhi' }
      },
      {
        name: 'Anita Desai', email: 'anita@tech.com', password: 'password123',
        phone: '9876543225', role: 'technician', isVerified: true,
        location: { type: 'Point', coordinates: [72.8700, 19.0800], address: 'Juhu', city: 'Mumbai', state: 'Maharashtra' }
      }
    ]);

    const technicians = await Technician.create([
      {
        user: techUsers[0]._id, skills: ['Electrician', 'AC Technician'],
        experience: 8, chargeRate: 450, chargeType: 'hourly', serviceRadius: 15,
        bio: 'Experienced electrician with 8+ years in residential and commercial wiring. Certified AC technician.',
        availability: { isOnline: true, slots: [
          { day: 'Monday', startTime: '09:00', endTime: '18:00' },
          { day: 'Tuesday', startTime: '09:00', endTime: '18:00' },
          { day: 'Wednesday', startTime: '09:00', endTime: '18:00' },
          { day: 'Thursday', startTime: '09:00', endTime: '18:00' },
          { day: 'Friday', startTime: '09:00', endTime: '18:00' },
          { day: 'Saturday', startTime: '10:00', endTime: '14:00' }
        ]},
        rating: { average: 4.8, count: 45 }, completedJobs: 156, totalEarnings: 78000, isVerified: true
      },
      {
        user: techUsers[1]._id, skills: ['Plumber', 'Mason'],
        experience: 12, chargeRate: 540, chargeType: 'hourly', serviceRadius: 20,
        bio: 'Master plumber specializing in pipe fitting, drainage, and bathroom renovations.',
        availability: { isOnline: true, slots: [
          { day: 'Monday', startTime: '08:00', endTime: '19:00' },
          { day: 'Tuesday', startTime: '08:00', endTime: '19:00' },
          { day: 'Wednesday', startTime: '08:00', endTime: '19:00' },
          { day: 'Thursday', startTime: '08:00', endTime: '19:00' },
          { day: 'Friday', startTime: '08:00', endTime: '17:00' }
        ]},
        rating: { average: 4.6, count: 32 }, completedJobs: 210, totalEarnings: 126000, isVerified: true
      },
      {
        user: techUsers[2]._id, skills: ['Carpenter', 'Painter', 'Interior Designer'],
        experience: 15, chargeRate: 720, chargeType: 'per_job', serviceRadius: 25,
        bio: 'Award-winning carpenter and interior designer. Custom furniture and home makeovers.',
        availability: { isOnline: true, slots: [
          { day: 'Monday', startTime: '10:00', endTime: '20:00' },
          { day: 'Tuesday', startTime: '10:00', endTime: '20:00' },
          { day: 'Wednesday', startTime: '10:00', endTime: '20:00' },
          { day: 'Thursday', startTime: '10:00', endTime: '20:00' },
          { day: 'Friday', startTime: '10:00', endTime: '20:00' },
          { day: 'Saturday', startTime: '10:00', endTime: '16:00' }
        ]},
        rating: { average: 4.9, count: 67 }, completedJobs: 89, totalEarnings: 71200, isVerified: true
      },
      {
        user: techUsers[3]._id, skills: ['Mechanic', 'Welder'],
        experience: 6, chargeRate: 360, chargeType: 'hourly', serviceRadius: 10,
        bio: 'Automotive mechanic and welding specialist. Door-step vehicle repair service.',
        availability: { isOnline: true, slots: [
          { day: 'Monday', startTime: '09:00', endTime: '18:00' },
          { day: 'Tuesday', startTime: '09:00', endTime: '18:00' },
          { day: 'Wednesday', startTime: '09:00', endTime: '18:00' },
          { day: 'Thursday', startTime: '09:00', endTime: '18:00' },
          { day: 'Friday', startTime: '09:00', endTime: '18:00' }
        ]},
        rating: { average: 4.3, count: 18 }, completedJobs: 45, totalEarnings: 18000, isVerified: false
      },
      {
        user: techUsers[4]._id, skills: ['Cleaner', 'Pest Control'],
        experience: 5, chargeRate: 315, chargeType: 'per_job', serviceRadius: 30,
        bio: 'Professional cleaning and pest control services for homes and offices.',
        availability: { isOnline: true, slots: [
          { day: 'Monday', startTime: '07:00', endTime: '20:00' },
          { day: 'Tuesday', startTime: '07:00', endTime: '20:00' },
          { day: 'Wednesday', startTime: '07:00', endTime: '20:00' },
          { day: 'Thursday', startTime: '07:00', endTime: '20:00' },
          { day: 'Friday', startTime: '07:00', endTime: '20:00' },
          { day: 'Saturday', startTime: '08:00', endTime: '18:00' },
          { day: 'Sunday', startTime: '08:00', endTime: '14:00' }
        ]},
        rating: { average: 4.5, count: 28 }, completedJobs: 120, totalEarnings: 42000, isVerified: true
      },
      {
        user: techUsers[5]._id, skills: ['Appliance Repair', 'Electrician'],
        experience: 10, chargeRate: 495, chargeType: 'hourly', serviceRadius: 20,
        bio: 'Appliance repair expert — washing machines, refrigerators, microwaves, and more.',
        availability: { isOnline: false, slots: [
          { day: 'Monday', startTime: '09:00', endTime: '17:00' },
          { day: 'Wednesday', startTime: '09:00', endTime: '17:00' },
          { day: 'Friday', startTime: '09:00', endTime: '17:00' }
        ]},
        rating: { average: 4.7, count: 41 }, completedJobs: 180, totalEarnings: 99000, isVerified: true
      }
    ]);
    console.log('Technicians created');

    const toolOwnerUsers = await User.create([
      {
        name: 'Sanjeev Tools', email: 'sanjeev@tools.com', password: 'password123',
        phone: '9876543230', role: 'toolowner', isVerified: true,
        location: { type: 'Point', coordinates: [77.2100, 28.6300], address: 'Sadar Bazaar', city: 'New Delhi', state: 'Delhi' }
      },
      {
        name: 'Mumbai Rentals', email: 'mumbai@tools.com', password: 'password123',
        phone: '9876543231', role: 'toolowner', isVerified: true,
        location: { type: 'Point', coordinates: [72.8600, 19.0650], address: 'Dadar', city: 'Mumbai', state: 'Maharashtra' }
      }
    ]);

    const toolOwners = await ToolOwner.create([
      {
        user: toolOwnerUsers[0]._id, shopName: 'Sanjeev Power Tools',
        description: 'Premium power tools and construction equipment rentals in Delhi NCR.',
        rating: { average: 4.6, count: 22 }, totalRentals: 85, totalEarnings: 127500, isVerified: true
      },
      {
        user: toolOwnerUsers[1]._id, shopName: 'Mumbai Tool Hub',
        description: 'Your one-stop shop for all tool rental needs in Mumbai.',
        rating: { average: 4.4, count: 15 }, totalRentals: 62, totalEarnings: 93000, isVerified: true
      }
    ]);

    const tools = await Tool.create([
      {
        owner: toolOwners[0]._id, name: 'Bosch Impact Drill', category: 'Power Tools', toolType: 'technical',
        description: 'Professional-grade 750W impact drill with variable speed control. Comes with bit set.',
        images: [], rentPrice: { hourly: 100, daily: 500 }, securityDeposit: 2000, condition: 'like_new',
        location: { type: 'Point', coordinates: [77.2100, 28.6300], address: 'Sadar Bazaar, Delhi' },
        totalRentals: 25, rating: { average: 4.7, count: 12 }
      },
      {
        owner: toolOwners[0]._id, name: 'Angle Grinder 4-inch', category: 'Power Tools', toolType: 'technical',
        description: 'Heavy-duty angle grinder for cutting and grinding metal and stone.',
        images: [], rentPrice: { hourly: 80, daily: 400 }, securityDeposit: 1500, condition: 'good',
        location: { type: 'Point', coordinates: [77.2100, 28.6300], address: 'Sadar Bazaar, Delhi' },
        totalRentals: 18, rating: { average: 4.5, count: 8 }
      },
      {
        owner: toolOwners[0]._id, name: 'Pressure Washer 1500W', category: 'Cleaning Equipment', toolType: 'technical',
        description: 'High-pressure washer perfect for cars, driveways, and building exteriors.',
        images: [], rentPrice: { hourly: 150, daily: 800 }, securityDeposit: 3000, condition: 'like_new',
        location: { type: 'Point', coordinates: [77.2100, 28.6300], address: 'Sadar Bazaar, Delhi' },
        totalRentals: 30, rating: { average: 4.8, count: 15 }
      },
      {
        owner: toolOwners[0]._id, name: 'Welding Machine ARC', category: 'Welding Equipment', toolType: 'technical',
        description: '200A ARC welding machine with electrode holder and cables.',
        images: [], rentPrice: { hourly: 200, daily: 1000 }, securityDeposit: 5000, condition: 'good',
        location: { type: 'Point', coordinates: [77.2100, 28.6300], address: 'Sadar Bazaar, Delhi' },
        totalRentals: 12, rating: { average: 4.3, count: 5 }
      },
      {
        owner: toolOwners[1]._id, name: 'Circular Saw 7-inch', category: 'Power Tools', toolType: 'technical',
        description: 'Precision circular saw for wood and laminate cutting. Laser guide included.',
        images: [], rentPrice: { hourly: 120, daily: 600 }, securityDeposit: 2500, condition: 'like_new',
        location: { type: 'Point', coordinates: [72.8600, 19.0650], address: 'Dadar, Mumbai' },
        totalRentals: 20, rating: { average: 4.6, count: 10 }
      },
      {
        owner: toolOwners[1]._id, name: 'Scaffolding Set (6ft)', category: 'Construction Equipment', toolType: 'technical',
        description: 'Complete scaffolding set with platform, wheels, and safety rails.',
        images: [], rentPrice: { hourly: 0, daily: 1500 }, securityDeposit: 10000, condition: 'good',
        location: { type: 'Point', coordinates: [72.8600, 19.0650], address: 'Dadar, Mumbai' },
        totalRentals: 8, rating: { average: 4.4, count: 4 }
      },
      {
        owner: toolOwners[1]._id, name: 'Garden Tool Kit', category: 'Gardening Tools', toolType: 'non-technical',
        description: 'Complete garden tool kit with pruner, spade, rake, hoe, and watering can.',
        images: [], rentPrice: { hourly: 50, daily: 250 }, securityDeposit: 500, condition: 'new',
        location: { type: 'Point', coordinates: [72.8600, 19.0650], address: 'Dadar, Mumbai' },
        totalRentals: 35, rating: { average: 4.9, count: 18 }
      },
      {
        owner: toolOwners[1]._id, name: 'Paint Sprayer Electric', category: 'Painting Tools', toolType: 'technical',
        description: 'HVLP electric paint sprayer for smooth, even coating on walls and furniture.',
        images: [], rentPrice: { hourly: 90, daily: 450 }, securityDeposit: 1800, condition: 'like_new',
        location: { type: 'Point', coordinates: [72.8600, 19.0650], address: 'Dadar, Mumbai' },
        totalRentals: 15, rating: { average: 4.5, count: 7 }
      }
    ]);
    console.log('Tools created');

    const bookings = await Booking.create([
      {
        user: users[0]._id, technician: technicians[0]._id, service: 'Electrician',
        description: 'Need to fix electrical wiring in living room. Some switches not working.',
        scheduledDate: new Date('2026-02-25'), timeSlot: { start: '10:00', end: '12:00' },
        status: 'confirmed', location: { address: 'Connaught Place, New Delhi', coordinates: [77.2167, 28.6358] },
        estimatedCost: 1000, paymentMethod: 'online'
      },
      {
        user: users[0]._id, technician: technicians[1]._id, service: 'Plumber',
        description: 'Leaking tap in kitchen and bathroom drain blockage.',
        scheduledDate: new Date('2026-02-20'), timeSlot: { start: '14:00', end: '16:00' },
        status: 'completed', location: { address: 'Connaught Place, New Delhi', coordinates: [77.2167, 28.6358] },
        estimatedCost: 1200, finalCost: 1100, paymentMethod: 'cash', paymentStatus: 'paid',
        completedAt: new Date('2026-02-20')
      },
      {
        user: users[1]._id, technician: technicians[2]._id, service: 'Carpenter',
        description: 'Custom bookshelf installation and door repair.',
        scheduledDate: new Date('2026-02-28'), timeSlot: { start: '11:00', end: '15:00' },
        status: 'pending', location: { address: 'Andheri West, Mumbai', coordinates: [72.8777, 19.0760] },
        estimatedCost: 3200, paymentMethod: 'online'
      },
      {
        user: users[2]._id, technician: technicians[3]._id, service: 'Mechanic',
        description: 'Car AC not cooling properly, need inspection and regas.',
        scheduledDate: new Date('2026-02-26'), timeSlot: { start: '09:00', end: '11:00' },
        status: 'confirmed', location: { address: 'Koramangala, Bangalore', coordinates: [77.5946, 12.9716] },
        estimatedCost: 800, paymentMethod: 'cash'
      }
    ]);
    console.log('Bookings created');

    await Review.create([
      {
        user: users[0]._id, targetType: 'technician', targetId: technicians[1]._id,
        targetModel: 'Technician', booking: bookings[1]._id,
        rating: 5, comment: 'Excellent work! Fixed the leaking tap quickly and professionally. Very polite and punctual.'
      },
      {
        user: users[1]._id, targetType: 'technician', targetId: technicians[2]._id,
        targetModel: 'Technician',
        rating: 5, comment: 'Amazing carpentry work. The custom bookshelf looks fantastic!'
      },
      {
        user: users[0]._id, targetType: 'tool', targetId: tools[0]._id,
        targetModel: 'Tool',
        rating: 4, comment: 'Good quality drill. Worked perfectly for my home project.'
      }
    ]);
    console.log('Reviews created');

    await Payment.create([
      {
        user: users[0]._id, type: 'booking', referenceId: bookings[1]._id,
        amount: 1100, method: 'cash', status: 'completed'
      }
    ]);
    console.log('Payments created');

    console.log('\nSeed data created successfully!\n');
    console.log('Login Credentials:');
    console.log('   Admin:      admin@localskill.com / admin123');
    console.log('   User:       rahul@test.com / password123');
    console.log('   Technician: vikram@tech.com / password123');
    console.log('   Tool Owner: sanjeev@tools.com / password123');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seedData();
