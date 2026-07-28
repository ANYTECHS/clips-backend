#!/bin/bash

echo "Creating commit for fiat payout encryption feature..."
echo ""

# Stage all changes
echo "Staging all changes..."
git add -A

echo ""
echo "Files to be committed:"
git status --short

echo ""
echo "Creating commit..."
git commit -m "feat(payouts): add secure fiat payout method storage with encryption

Implements encrypted storage for bank account information with the following features:

Core Implementation:
- Add PayoutMethod model with AES-256-GCM encrypted fields
- Create PayoutMethodService with encryption/decryption logic
- Add PayoutMethodController with REST API endpoints
- Implement DTOs for create/update operations
- Add comprehensive test suite with full coverage

Security Features:
- AES-256-GCM encryption at rest
- Unique IV per encryption operation
- Authenticated encryption (AEAD)
- Data minimization (only last 4 digits in plaintext)
- JWT authentication on all endpoints
- User isolation and access control
- Soft delete for audit trail

API Endpoints:
- POST /payout-methods - Create payout method
- GET /payout-methods - List all methods
- GET /payout-methods/default - Get default method
- GET /payout-methods/:id - Get specific method
- PUT /payout-methods/:id - Update method
- DELETE /payout-methods/:id - Delete method

Documentation:
- FIAT_PAYOUT_SECURITY.md - Complete security documentation
- PAYOUT_ARCHITECTURE.md - Architecture diagrams and data flows
- QUICK_START_PAYOUT_METHODS.md - 5-minute setup guide
- IMPLEMENTATION_CHECKLIST.md - Implementation status
- src/payouts/README.md - Developer quick reference

Database Changes:
- Added PayoutMethod table with encrypted fields
- Added migration file
- Updated Prisma schema with relationships

Files Changed:
- New: 13 files (services, controllers, DTOs, tests, docs)
- Modified: 3 files (schema, module, env.example)

Closes: #[issue-number]
Labels: payout, security, enhancement
Difficulty: advanced"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Commit created successfully!"
    echo ""
    echo "Commit details:"
    git log -1 --stat
else
    echo ""
    echo "❌ Commit failed!"
    echo "Checking for issues..."
    git status
fi
