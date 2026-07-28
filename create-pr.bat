@echo off
REM Create Pull Request for Fiat Payout Encryption Feature

"C:\Program Files\GitHub CLI\gh.exe" pr create ^
  --title "feat(payouts): add secure fiat payout method storage with encryption" ^
  --body "## 🔐 Secure Fiat Payout Method Storage\n\nImplements encrypted storage for bank account information with AES-256-GCM encryption.\n\n### ✅ Features Implemented\n- PayoutMethod model with encrypted fields (account numbers, routing numbers, SWIFT, IBAN)\n- Full CRUD API with JWT authentication\n- Data sanitization (no sensitive data exposed)\n- Soft delete for audit trail\n- Comprehensive test suite\n- Complete security documentation\n\n### 🔒 Security Features\n- AES-256-GCM encryption at rest\n- Unique IV per encryption\n- Authenticated encryption (AEAD)\n- Only last 4 digits stored in plaintext\n- User isolation and access control\n\n### 📚 Documentation\n- FIAT_PAYOUT_SECURITY.md - Complete security documentation\n- PAYOUT_ARCHITECTURE.md - Architecture diagrams\n- QUICK_START_PAYOUT_METHODS.md - Setup guide\n\n### 🧪 Testing\nRun: npm test -- payout-method.service.spec.ts\n\n### 🚀 Deployment\n1. Set ENCRYPTION_SECRET env var\n2. Run: npx prisma migrate deploy\n\n**Labels:** payout, security, enhancement\n**Difficulty:** advanced" ^
  --label "enhancement,security,payout" ^
  --base main

echo.
echo Pull request created successfully!
pause
