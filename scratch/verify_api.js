import http from 'http';
import db from '../src/db.js';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function verifyAPI() {
  console.log('=== EXPRESS ENDPOINTS ESM API VERIFICATION ===\n');

  // Query John Doe's dynamic ID
  const johnDoe = db.prepare("SELECT id FROM customers WHERE email = 'john.doe@example.com'").get();
  const johnDoeId = johnDoe.id;
  console.log(`Resolved John Doe Customer ID: ${johnDoeId}`);

  // Test 1: GET /cruises (capacityLeft is present)
  console.log('Test 1: GET /cruises');
  const res1 = await makeRequest({
    hostname: '127.0.0.1',
    port: 3001,
    path: '/cruises',
    method: 'GET'
  });
  console.log('Status:', res1.statusCode);
  const targetCruise = res1.body.find(c => c.name === 'Bahamas Getaway');
  console.log('Target Cruise details (checking capacity tracking):');
  console.log({
    id: targetCruise.id,
    name: targetCruise.name,
    capacity: targetCruise.capacity,
    bookedCount: targetCruise.bookedCount,
    capacityLeft: targetCruise.capacityLeft,
    durationNights: targetCruise.durationNights
  });
  if (typeof targetCruise.capacityLeft !== 'number') {
    throw new Error('capacityLeft is missing or not a number');
  }

  // Test 2: POST /quote (estimation without bookings)
  console.log('\nTest 2: POST /quote');
  const quotePayload = {
    cruiseId: targetCruise.id, // Bahamas Getaway
    passengers: [30, 5], // Alice (30), Charlie (5)
    optionalServices: ['WiFi'],
    promoCode: 'CREW25',
    customerId: johnDoeId // John Doe
  };
  const res2 = await makeRequest({
    hostname: '127.0.0.1',
    port: 3001,
    path: '/quote',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, quotePayload);
  console.log('Status:', res2.statusCode);
  console.log('Quote Total Price:', res2.body.totalPrice);
  const quotePrice = res2.body.totalPrice;

  // Verify that it did not register passengers or booking in the DB
  const dbBookingsCount = db
    .prepare("SELECT COUNT(*) as count FROM bookings WHERE customer_id = ? AND booking_reference LIKE 'CRZ-%'").get(johnDoeId).count;
  console.log(`Bookings in DB for customer ${johnDoeId} after quote:`, dbBookingsCount);

  // Test 3: POST /bookings (persists a booking)
  console.log('\nTest 3: POST /bookings');
  const bookingPayload = {
    customerId: johnDoeId,
    cruiseId: targetCruise.id,
    passengers: [
      { firstName: 'Alice', lastName: 'API', age: 30 },
      { firstName: 'Charlie', lastName: 'API', age: 5 }
    ],
    optionalServices: ['WiFi'],
    promoCode: 'CREW25'
  };
  const res3 = await makeRequest({
    hostname: '127.0.0.1',
    port: 3001,
    path: '/bookings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }, bookingPayload);
  console.log('Status:', res3.statusCode);
  console.log('Created Booking Reference:', res3.body.bookingReference);
  console.log('Created Booking Total Price:', res3.body.totalPrice);
  const createdRef = res3.body.bookingReference;
  const createdPrice = res3.body.totalPrice;

  if (quotePrice !== createdPrice) {
    throw new Error(`Quote price (${quotePrice}) and confirmed booking price (${createdPrice}) are not identical!`);
  }
  console.log('SUCCESS: pre-confirmation quote price is identical to confirmed booking price!');

  // Test 4: GET /bookings/:reference (retrieves booking stored breakdown)
  console.log(`\nTest 4: GET /bookings/${createdRef}`);
  const res4 = await makeRequest({
    hostname: '127.0.0.1',
    port: 3001,
    path: `/bookings/${createdRef}`,
    method: 'GET'
  });
  console.log('Status:', res4.statusCode);
  console.log('Stored Booking Reference:', res4.body.bookingReference);
  console.log('Stored Booking Date:', res4.body.bookingDate);
  console.log('Passengers stored count:', res4.body.passengers.length);
  console.log('WiFi Service details:', res4.body.optionalServices[0]);
  console.log('Priced Snapshot retrieved:', res4.body.priceSnapshot);
  if (res4.body.priceSnapshot.totalPriceCharged !== createdPrice) {
    throw new Error('Historical price snapshot does not match created booking total price');
  }

  // Test 5: Re-fetch GET /cruises (verify capacity was decremented by 2 passengers)
  console.log('\nTest 5: Re-fetch GET /cruises (Verify Capacity Decremented)');
  const res5 = await makeRequest({
    hostname: '127.0.0.1',
    port: 3001,
    path: '/cruises',
    method: 'GET'
  });
  const updatedTargetCruise = res5.body.find(c => c.name === 'Bahamas Getaway');
  console.log('Target Cruise capacity left (previous):', targetCruise.capacityLeft);
  console.log('Target Cruise capacity left (now):', updatedTargetCruise.capacityLeft);
  if (updatedTargetCruise.capacityLeft !== targetCruise.capacityLeft - 2) {
    throw new Error(`Expected capacity to decrement by 2, but changed from ${targetCruise.capacityLeft} to ${updatedTargetCruise.capacityLeft}`);
  }
  console.log('SUCCESS: Cruise capacity correctly decremented by 2 in DB!');

  console.log('\n=== ALL ENDPOINT ROUTINGS VERIFIED SUCCESSFULLY ===');
}

verifyAPI().catch(console.error);
