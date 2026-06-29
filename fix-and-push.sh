#!/bin/bash

echo "=== Step 1: Check current status ==="
git status

echo ""
echo "=== Step 2: Check current branch ==="
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

echo ""
echo "=== Step 3: Check if changes are committed ==="
git log --oneline -1

echo ""
echo "=== Step 4: Check if we have uncommitted changes ==="
if [[ -n $(git status -s) ]]; then
    echo "⚠️  You have uncommitted changes!"
    echo "Staging all changes..."
    git add -A
    
    echo "Creating commit..."
    git commit -m "feat(payouts): add secure fiat payout method storage with encryption

Implements encrypted storage for bank account information with the following features:

- Add PayoutMethod model with AES-256-GCM encrypted fields
- Create PayoutMethodService with encryption/decryption
- Add REST API endpoints for CRUD operations
- Implement data sanitization (no sensitive data in responses)
- Add soft delete for audit trail
- Support for bank accounts, wire transfers, and ACH
- Comprehensive test suite with full coverage
- Complete security documentation

Security features:
- AES-256-GCM encryption at rest
- Unique IV per encryption
- Authenticated encryption (AEAD)
- Data minimization (only last 4 digits in plaintext)
- JWT authentication on all endpoints
- User isolation and access control"
else
    echo "✅ All changes are committed"
fi

echo ""
echo "=== Step 5: Ensure we're on the feature branch ==="
if [ "$CURRENT_BRANCH" != "feature/fiat-payout-encryption" ]; then
    echo "Creating and switching to feature branch..."
    git checkout -b feature/fiat-payout-encryption
else
    echo "✅ Already on feature/fiat-payout-encryption"
fi

echo ""
echo "=== Step 6: Push to remote ==="
echo "Pushing to origin/feature/fiat-payout-encryption..."
git push -u origin feature/fiat-payout-encryption --verbose

echo ""
echo "=== Step 7: Verify push ==="
git branch -r | grep feature/fiat-payout-encryption

echo ""
echo "✅ Done! Your branch should now be pushed."
echo ""
echo "Next step: Create PR with this command:"
echo "gh pr create --title 'feat(payouts): add secure fiat payout method storage with encryption' --base main"
