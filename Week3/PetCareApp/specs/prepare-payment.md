```markdown
# Feature: Prepare payment details

## 1. User goal
Who needs this feature? What do they want to achieve?

Pet owners want to review the selected service and its amount before making a payment.
They call this endpoint with a service ID and receive the official price and status so they can confirm the details.

## 2. Scope
What will the feature do? What will it NOT do?

**Will do:**
- Accept a service ID in the URL
- Look up the service in a mock catalogue
- Return the official service name, amount, currency and status as JSON

**Will NOT do:**
- Charge any money
- Call a real payment gateway
- Accept a client-supplied amount
- Require login
- Create new database tables
- Create new EJS pages

## 3. Request
What HTTP method and URL are used? What input is needed?

- Method: GET
- URL: `/payments/prepare/:serviceId`
- Input: only the `serviceId` path parameter (number)
- The server uses the catalogue price. The client must not send an amount.

## 4. Service catalogue
What are the available service IDs, names and prices?

| ID (number) | Service name (string) | Price (number) |
|-------------|-----------------------|----------------|
| 1           | Vaccination           | 35             |
| 2           | Pet Grooming          | 50             |
| 3           | Boarding              | 80             |

## 5. Successful response
What HTTP status, JSON fields, values and types are required?

**HTTP Status:** 200 OK

**JSON response (exactly 5 fields):**

```json
{
  "serviceId": 1,
  "serviceName": "Vaccination",
  "amount": 35,
  "currency": "sgd",
  "status": "READY_FOR_PAYMENT"
}
```

- `serviceId` and `amount` are numbers
- `serviceName`, `currency` and `status` are strings
- `currency` must be exactly `"sgd"`
- `status` must be exactly `"READY_FOR_PAYMENT"`

## 6. Unsuccessful response
What happens when the requested service does not exist?

**HTTP Status:** 404 Not Found

```json
{
  "error": "Service not found"
}
```

## 7. Acceptance criteria

- AC1: Service ID 1 returns 200 with serviceName "Vaccination" and amount 35
- AC2: Service ID 2 returns 200 with serviceName "Pet Grooming" and amount 50
- AC3: Service ID 3 returns 200 with serviceName "Boarding" and amount 80
- AC4: Service ID 999 returns 404 with `{"error":"Service not found"}`
- AC5: Every successful response contains exactly 5 fields with the correct types and fixed values (`currency: "sgd"`, `status: "READY_FOR_PAYMENT"`)

## 8. Open questions
What has not yet been agreed? Do not silently invent an answer

- None for this classroom mock endpoint. Scope is fully defined.
```