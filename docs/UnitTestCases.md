# Unit Test Cases: Cruise Pricing & Booking Business Rules

This document specifies the exact unit test suites and input/output expectations for the Cruise Booking pricing engine and constraint validators.

---

## 1. Happy Path Cases

### Case 1.1: Standard Couple (No Extras, No Promos)
- **Input**: 
  - Cruise ID: 1 (Bahamas Getaway, Adult Base price: $599.00)
  - Passengers: `['adult', 'adult']` (2 passengers, ages 18+)
  - Services: `[]`
  - Promo: `null`
- **Expected Output**:
  - Cruise Base Price: $599.00
  - Itemized Passenger Fares: $599.00, $599.00 (Subtotal: $1198.00)
  - Group Discount: 0% ($0.00 reduction)
  - Net Fares: $1198.00
  - Services cost: $0.00
  - Promo discount: $0.00
  - Tax (12%): $143.76
  - Total Price: $1341.76

---

## 2. Age-Based Boundary Cases

### Case 2.1: Infant vs Child Boundary (Age 4 vs 5)
- **Inputs**:
  - Cruise ID: 1 ($599.00 base price)
  - Passengers: `[{ age: 4, name: 'Infant' }, { age: 18, name: 'Adult' }]`
  - Expected: Age 4 pays **$0.00** (100% discount). Net Fares: $599.00.
- **Inputs**:
  - Passengers: `[{ age: 5, name: 'Child' }, { age: 18, name: 'Adult' }]`
  - Expected: Age 5 pays **$299.50** (50% discount). Net Fares: $898.50.

### Case 2.2: Child vs Teen Boundary (Age 11 vs 12)
- **Inputs**:
  - Passengers: `[{ age: 11, name: 'Child' }, { age: 18, name: 'Adult' }]`
  - Expected: Age 11 pays **$299.50** (50% discount). Net Fares: $898.50.
- **Inputs**:
  - Passengers: `[{ age: 12, name: 'Teen' }, { age: 18, name: 'Adult' }]`
  - Expected: Age 12 pays **$449.25** (25% discount, paying 75% of base). Net Fares: $1048.25.

### Case 2.3: Teen vs Adult Boundary (Age 17 vs 18)
- **Inputs**:
  - Passengers: `[{ age: 17, name: 'Teen' }, { age: 18, name: 'Adult' }]`
  - Expected: Age 17 pays **$449.25** (25% discount). Net Fares: $1048.25.
- **Inputs**:
  - Passengers: `[{ age: 18, name: 'Adult 1' }, { age: 18, name: 'Adult 2' }]`
  - Expected: Both pay **$599.00** (0% discount). Net Fares: $1198.00.

---

## 3. Passenger Count Constraints

### Case 3.1: Maximum Boundary (Exactly 6 Passengers)
- **Input**:
  - Cruise ID: 1
  - Passengers: `['adult', 'adult', 'adult', 'adult', 'adult', 'adult']` (6 passengers)
- **Expected Output**: Success. (Group discount: 10%).

### Case 3.2: Exceeding Maximum Boundary (7 Passengers)
- **Input**:
  - Passengers: `['adult', 'adult', 'adult', 'adult', 'adult', 'adult', 'adult']` (7 passengers)
- **Expected Error**: `MAX_PASSENGERS_EXCEEDED`

### Case 3.3: Empty Booking (0 Passengers)
- **Input**:
  - Passengers: `[]`
- **Expected Error**: `NO_PASSENGERS_PROVIDED`

### Case 3.4: Rejection of Child-Only Bookings (0 Adults)
- **Input**:
  - Passengers: `[{ age: 10, name: 'Child 1' }, { age: 12, name: 'Teen 1' }]`
- **Expected Error**: `MINIMUM_ONE_ADULT_REQUIRED`

---

## 4. Promo Code Rejection Reasons

### Case 4.1: Non-Existent Code (`invalid code`)
- **Input**:
  - Promo Code: `INVALIDXYZ`
- **Expected Error**: `invalid code`

### Case 4.2: Outside Date Boundaries (`expired`)
- **Input**:
  - Promo Code: `WELCOME10` (Seeded active range: 2026-01-01 to 2026-12-31)
  - Current Date: `2027-01-01`
- **Expected Error**: `expired`

### Case 4.3: Exhausted Global Limit (`exhausted`)
- **Setup**: Seed a test promo with `max_redemptions = 1` and `redemption_count = 1`.
- **Input**:
  - Promo Code: `EXHAUSTED_PROMO`
- **Expected Error**: `exhausted`

### Case 4.4: Customer Limit Exceeded (`per-customer limit reached`)
- **Setup**: `WELCOME10` has a `limit_per_customer = 1`. Customer John Doe has already redeemed it on booking 1.
- **Input**:
  - Customer ID: John Doe's ID
  - Promo Code: `WELCOME10`
- **Expected Error**: `per-customer limit reached`

---

## 5. Promo Code Spend Boundaries

### Case 5.1: Exactly at Minimum Spend Boundary
- **Setup**: `CRUISE50` has a `min_spend = 500`.
- **Input**:
  - Cruise ID: 1 ($599.00 base price)
  - Passengers: `['adult']` (Net subtotal = $599.00, which is >= $500.00)
  - Promo Code: `CRUISE50`
- **Expected Output**: Success. $50.00 flat discount applied.

### Case 5.2: Below Minimum Spend Boundary
- **Input**:
  - Cruise ID: 1 ($599.00 base price)
  - Passengers: `[3]` (Infant age 3 pays 50% of adult fare = $299.50)
  - Plus one adult required: passengers `[3, 'adult']` -> subtotal = $299.50 + $599.00 = $898.50. Wait! Let's choose a lower base price or a case where the subtotal is under $500.
  - E.g. Cruise ID: 1, passengers: `[2, 'adult']` (Infant pays $0.00 + adult pays $599.00 = $599.00. Wait, this is still above $500).
  - Let's construct a case with a child and adult. E.g. if we have a test cruise with base price $400, and passengers `['adult']`, the subtotal is $400.
  - Applying `CRUISE50` (min spend $500) to subtotal $400 should trigger a failure.
- **Expected Error**: `minimum spend not met`

---

## 6. Capacity Limits

### Case 6.1: Capacity Exactly at Limit
- **Setup**: Test cruise with capacity 2.
- **Input**: Insert 2 passengers in booking -> Success. Cruise `booked_count` reaches 2/2.
- **Expected Output**: Cruise fully booked. Subsequent booking attempts on this cruise fail with `CHECK constraint failed: booked_count <= capacity`.
