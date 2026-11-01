# Security Specification: برج الفتوح (Bourj Al-Fotouh)

## 1. System Invariants & Core Security Rules

1. **Role-Based Access Control (RBAC) Hardening**:
   - Only validated administrators (documented in `/admins/{adminId}` or runtime verified manager email) have full CRUD privileges across all buildings, apartments, payments, expenses, and users.
   - Non-admin users (Owners and Tenants) cannot create, alter, or delete any payment records, expenses, building parameters, or apartment dues.
   - Self-assignment or privilege escalation to `role: 'admin'` is mathematically blocked at the database rule layer.

2. **Apartment Isolation (Multi-Tenant ABAC)**:
   - Owners can only view documents belonging to their assigned apartment/building.
   - Tenants can only view records for their leased unit within their active lease period.
   - Residents cannot read or write data of other residents' apartments.

3. **Payment Integrity**:
   - Payments are strictly immutable for residents. Only verified Admins can create, update, or cancel payments.
   - Every payment mutation generates an audit log in `/payment_audit_logs`.

4. **Public & Community Resources**:
   - Announcements are readable by all authenticated residents of the respective building.
   - Maintenance tickets and facility bookings can be created by authenticated residents for their own unit, and can be viewed/updated by admins or the creator.

## 2. The Dirty Dozen Threat Payloads (Must Return PERMISSION_DENIED)

1. **Payload 1: Resident Self-Elevation to Admin**:
   A normal resident sends an update to `/users/{uid}` changing `role: "admin"`.
   *Result*: REJECTED.

2. **Payload 2: Resident Modifies Payment Amount**:
   A tenant attempts to update `/payments/{paymentId}` setting `amount: 0`.
   *Result*: REJECTED (writes restricted to `isAdmin()`).

3. **Payload 3: Resident Deletes Payment Receipt**:
   An owner attempts `delete` on `/payments/{paymentId}`.
   *Result*: REJECTED (delete restricted to `isAdmin()`).

4. **Payload 4: Tenant Reads Other Apartment Private Records**:
   A tenant assigned to `apt-101` requests `/apartments/apt-202`.
   *Result*: REJECTED (residents can only read their matching `apartmentId`).

5. **Payload 5: Unauthenticated User Attempts Read**:
   An unauthenticated guest queries `/buildings` or `/apartments`.
   *Result*: REJECTED (requires `isSignedIn()`).

6. **Payload 6: Resident Modifies Building Treasury Balance**:
   A resident tries to update `/buildings/{buildingId}` with modified `balance`.
   *Result*: REJECTED.

7. **Payload 7: Resident Posts Building Expense**:
   A resident attempts to write to `/expenses/{expenseId}`.
   *Result*: REJECTED.

8. **Payload 8: Ghost Field Injection (Shadow Update)**:
   An attacker sends an apartment update with an unauthorized shadow field `isVerifiedAdmin: true`.
   *Result*: REJECTED via strict schema validation.

9. **Payload 9: Path Traversal / ID Poisoning**:
   An attacker sends a write with an invalid document ID containing path traversal characters `../../`.
   *Result*: REJECTED via `isValidId()`.

10. **Payload 10: Resident Deletes Maintenance Ticket of Another Resident**:
    Resident A attempts to delete a ticket filed by Resident B.
    *Result*: REJECTED.

11. **Payload 11: Spoofed Admin Email Without Token Verification**:
    Attacker creates a session claiming admin email with `email_verified: false`.
    *Result*: REJECTED via `request.auth.token.email_verified == true`.

12. **Payload 12: Over-Sized Denial-of-Wallet Payload**:
    Attacker submits a 2MB string in maintenance ticket description.
    *Result*: REJECTED by string size limits (`.size() <= 2000`).
