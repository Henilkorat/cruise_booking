# Business Requirements & Design Decisions

This document outlines the business rules, assumptions, and clarifications made during the implementation of the Cruise Booking System, highlighting specific gaps or ambiguities in the brief and how they were resolved.

---

## 1. Point of Tax Application

### The Ambiguity
The brief specifies a **12% tax rate** but does not clarify the exact sequence of calculations—specifically, whether tax is calculated on the raw base fare, before or after optional services, or before or after promo codes.

### The Resolution
Tax (12%) is calculated on the **net subtotal** after all discounts (child fare bands, group size discounts, and promo codes) and optional services are applied.

**Calculation Sequence:**
1. Calculate individual passenger fares based on age bands.
2. Sum fares to get `faresSubtotal`.
3. Apply group size discount to get `groupDiscountAmount`.
4. Deduct group discount to get `cruiseFaresNet`.
5. Add selected optional services (Insurance, WiFi, Excursion) to get `prePromoSubtotal`.
6. Deduct promo code discount to get `netSubtotal`.
7. **Calculate 12% tax on the `netSubtotal`.**
8. Add tax to `netSubtotal` to get the grand `totalPrice`.

### Justification
Under standard commercial and tax regulations (such as US Sales Tax and VAT guidelines), tax must only be collected on the actual cash consideration paid by the consumer. Charging tax on a pre-discount value is legally incorrect and would cause financial discrepancy audits.

---

## 2. Stacking Group Discounts & Promo Codes

### The Ambiguity
The brief does not explicitly define whether a customer booking as a group (triggering the 5% or 10% auto-discount) is allowed to also apply a promotional coupon code (stacking both discounts).

### The Resolution
**Stacking is fully permitted.** 
The group discount acts as a volume pricing adjustment on the cruise tickets, while the promo code acts as a final cart-level reduction.

### Justification
Allowing stacking creates a premium, high-converting customer experience. To protect margins, the group discount applies **only to the cruise fare** (not optional services), and promo codes can enforce their own `min_spend` limits on the discounted subtotal.

---

## 3. Timing of Promo Code Minimum Spend Validation

### The Ambiguity
The brief states that promo codes can have a "minimum spend" requirement. It does not state whether this minimum spend should be evaluated against the initial gross ticket price, the ticket price after group discounts, or the total cart value including optional services.

### The Resolution
The minimum spend threshold is checked against the **pre-promo subtotal** (net cruise ticket fares + optional services, before the promo discount itself is deducted).

### Justification
This approach represents standard e-commerce cart validation. Checking the pre-promo subtotal ensures the promo is only triggered when the customer's actual cart value (what they would otherwise pay) meets the threshold. Using the gross price instead would allow users who pay less than the threshold (due to group or child discounts) to redeem the coupon, defeating its financial incentive.

---

## 4. Rounding Rules for Money

### The Ambiguity
Floating-point mathematics in standard computing engines (IEEE-754 arithmetic used by JavaScript) leads to precision leakages (e.g. `599 * 0.1` becomes `59.900000000000006`). The brief does not define a rounding policy.

### The Resolution
We implement a strict rounding helper `roundMoney(val)` that rounds all currency numbers to exactly **two decimal places** using standard half-up rounding:
```javascript
const roundMoney = (val) => Math.round((val + Number.EPSILON) * 100) / 100;
```
Rounding is applied immediately at every intermediate step:
- Individual passenger discounted ticket fares.
- The total sum of passenger fares.
- The group discount deduction.
- Individual optional service charges.
- The pre-promo subtotal.
- The promo discount deduction.
- The final tax charge.
- The grand total price.

### Justification
Ensures that all line items displayed on the client-facing invoice sum exactly to the printed total, preventing rounding discrepancies of 1 cent on invoices.
