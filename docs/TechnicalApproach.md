# Technical Approach: Database Design & Schema Reasoning

This document details the architectural decisions and database design choices implemented for the Cruise Booking system database schema.

---

## 1. Price Reconstructability & The Price Snapshot Table

### The Problem
In an active booking system, pricing inputs change frequently:
- Cruises adjust their base fares dynamically based on season, demand, or cabin category.
- Tax rates vary due to changing local regulations.
- Discount rules for children and age-based fare bands are revised.
- Promo code percentages or values are altered.

If the database only saves a static `total_price` on the `bookings` table, it is impossible to audit *how* that final number was calculated once these rule matrices change.

### The Solution: `booking_price_snapshots`
We implement a dedicated `booking_price_snapshots` table containing a priced snapshot of all line items applied at the transaction moment:
- `base_fare_charged`: Base fare of the cruise at the time of booking.
- `child_discount_pct_applied`: The exact percentage reduction applied due to child age tiers.
- `group_discount_pct_applied`: The percentage discount applied based on group size (total passengers).
- `tax_rate_applied`: The tax rate applied (e.g., `0.12` for 12%).
- `promo_type_applied` & `promo_value_applied`: The type (`percent` or `flat`) and specific deduction of the applied promo.
- `total_price_charged`: The computed grand total.

This approach guarantees that even if a cruise price doubles or tax laws change, the historical record remains audit-compliant, enabling exact receipt reconstruction and revenue reporting.

---

## 2. Transactional Capacity Enforcement

### The Problem
Overselling a cruise itinerary creates significant customer service issues, logistics headaches, and potential legal liabilities. We need to guarantee that the database blocks passenger registration if the cruise capacity is fully booked, even in multi-threaded/concurrent booking scenarios.

### The Solution: CHECK Constraints & Triggers
To enforce this at the storage level, we tracking capacity via a denormalized `booked_count` column on the `cruises` table:
1. **CHECK Constraint**:
   ```sql
   capacity INTEGER NOT NULL CHECK(capacity > 0),
   booked_count INTEGER NOT NULL DEFAULT 0 CHECK(booked_count <= capacity)
   ```
   If any operation drives `booked_count` above `capacity`, SQLite returns a constraint violation error and rolls back the transaction.
2. **Passenger Insertion & Deletion Triggers**:
   - `trg_passenger_insert`: Triggers after adding a passenger. If the booking status is `confirmed`, it increments the cruise `booked_count` by 1.
   - `trg_passenger_delete`: Triggers after removing a passenger. If the booking status is `confirmed`, it decrements the cruise `booked_count` by 1.
3. **Booking Cancellation & Confirmation Triggers**:
   - `trg_booking_cancelled`: Triggers when updating status to `'cancelled'`. Decrements `booked_count` by the passenger count of that booking.
   - `trg_booking_confirmed`: Triggers when updating status to `'confirmed'`. Increments `booked_count` by the passenger count.

This mechanism ensures that capacity is tracked and validated automatically by the database engine without relying on application-level checks, eliminating race conditions.

---

## 3. Enforcing Promo Code Redemptions

Promo codes require strict limits to prevent financial abuse or accidental double-dipping. We enforce limits via triggers on insertion to `promo_code_redemptions`:

1. **Global Limits**:
   We compare the current `redemption_count` on `promo_codes` with its `max_redemptions`. If the limit is reached, a `RAISE(FAIL, 'PROMO_GLOBAL_LIMIT_REACHED')` aborts the insertion.
2. **Per-Customer Limits**:
   We query the history of redemptions for this customer and promo. If the count exceeds `limit_per_customer`, the trigger aborts the insertion using `RAISE(FAIL, 'PROMO_CUSTOMER_LIMIT_REACHED')`.
3. **Automatic Count Updates**:
   - Insertion increments the `redemption_count` on the `promo_codes` table.
   - Deletion decrements the `redemption_count`.

---

## 4. Point of Tax Application & Justification

### The Design Decision
In our pricing algorithm (`pricingService.js`), the 12% sales/hospitality tax is calculated using the following sequence:
1. Determine the gross cruise passenger fares after applying child fare band discounts.
2. Apply the group discount percentage to the gross cruise passenger fares.
3. Add the optional service costs (Insurance, WiFi, Excursion) to establish the pre-promo subtotal.
4. Deduct the promo code discount (percentage or flat value) from the subtotal.
5. **Apply 12% Tax on the remaining net subtotal.**
6. Add the tax to the net subtotal to produce the grand total.

### Justification
1. **Net Taxable Sales Standard**: According to global taxation rules (such as US State Sales Tax and European VAT guidelines), tax must only be collected on the actual consideration paid by the buyer (the transaction value). When a seller issues a coupon or rebate (the promo code), the taxable amount is reduced because the revenue received is lower. Charging tax on pre-coupon subtotals would penalize the customer and lead to discrepancy disputes.
2. **Service Inclusions**: Optional services (wifi, dining upgrades) are taxable values because they constitute standard onboard expenditures. Including them in the taxable base is standard practice.
3. **Non-Double Taxation**: Group discounts represent a direct ticket discount (not a payment tender), meaning the taxable base of the cruise ticket is reduced.

---

## 5. Normalization Decisions and Future Improvements

With additional development time, several areas would benefit from further normalization:

### Decoupling Tax Rates
- **Current implementation**: Tax rates are stored statically in code and written as `0.12` to the snapshot.
- **Future design**: Create a `tax_rules` table tracking rates by jurisdiction and date ranges (e.g. `effective_from`, `effective_to`), allowing the system to query dynamic tax rules.

### Decoupling Itineraries and Cabins
- **Current implementation**: Cruises has a flat `capacity` and `base_price`.
- **Future design**: 
  - Normalize cabins out into a `cabins` table (e.g., Suite, Balcony, Interior) linked to `cruise_cabins` with individual inventory limits.
  - Separate cruises (specific voyages on dates) from `routes` / `ports` (an itinerary schedule mapping physical stops).

### Dynamic Promotions Rules
- **Current implementation**: Promo codes are flat/percent and applied globally to the total.
- **Future design**: Normalize promo rules into tables detailing criteria (e.g., min booking value, restricted cruise destinations, specific departure dates), decoupling rules from the core code logic.
