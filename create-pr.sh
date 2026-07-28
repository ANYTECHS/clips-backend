#!/bin/bash

# Create Pull Request for Fiat Payout Encryption Feature

gh pr create \
  --title "feat(payouts): add secure fiat payout method storage with encryption" \
  --body "## 🔐 Secure Fiat Payout Method Storage

Implements encrypted storage for bank account information with AES-256-GCM encryption.

### ✅ Features Implemented
- PayoutMethod model with encrypted fields (account numbers, routing numbers, SWIFT, IBAN)
- Full CRUD API with JWT authentication
- Data sanitization (no sensitive data exposed)
- Soft delete for audit trail
- Comprehensive test suite
- Complete security documentation

### 🔒 Security Features
- AES-256-GCM encryption at rest
- Unique IV per encryption
- Authenticated encryption (AEAD)
- Only last 4 digits stored in plaintext
- User isolation and access control

### 📦 What's Included

**New Files:**
- \`PayoutMethod\` Prisma model with encrypted fields
- \`PayoutMethodService\` with encryption/decryption
- \`PayoutMethodController\` with REST endpoints
- DTOs for create/update operations
- Comprehensive test suite
- Security documentation

**Modified Files:**
- \`.env.example\` - Added ENCRYPTION_SECRET
- \`prisma/schema.prisma\` - Added PayoutMethod model
- \`src/payouts/payouts.module.ts\` - Integrated new components

### 📚 Documentation
- \`FIAT_PAYOUT_SECURITY.md\` - Complete security documentation
- \`PAYOUT_ARCHITECTURE.md\` - Architecture diagrams and data flows
- \`QUICK_START_PAYOUT_METHODS.md\` - 5-minute setup guide
- \`IMPLEMENTATION_CHECKLIST.md\` - Implementation status
- \`src/payouts/README.md\` - Developer quick reference

### 🧪 Testing
\`\`\`bash
npm test -- payout-method.service.spec.ts
\`\`\`

All tests passing ✅

### 🚀 Deployment Steps
1. Generate encryption secret: \`openssl rand -base64 32\`
2. Set \`ENCRYPTION_SECRET\` environment variable
3. Run database migration: \`npx prisma migrate deploy\`
4. Verify encryption in database

### 🔍 Review Checklist
- [ ] Code review completed
- [ ] Security review completed (recommended)
- [ ] Tests passing
- [ ] Documentation reviewed
- [ ] Migration tested in staging

### 📋 Acceptance Criteria
- [x] Add encrypted fields for bank account info
- [x] Create PayoutMethod model
- [x] Encrypt/decrypt in service layer
- [x] Secure storage implementation
- [x] API endpoints with authentication
- [x] Comprehensive tests
- [x] Complete documentation

**Labels:** payout, security, enhancement
**Difficulty:** advanced

---

**⚠️ Security Note:** This PR handles sensitive financial data. Security team review is recommended before merging." \
  --label "enhancement,security,payout" \
  --base main
