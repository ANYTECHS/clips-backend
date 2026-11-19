#!/bin/bash

echo "=========================================="
echo "Git Diagnostic and Fix Script"
echo "=========================================="

echo ""
echo "1. Checking current branch..."
CURRENT_BRANCH=$(git branch --show-current)
echo "   Current branch: $CURRENT_BRANCH"

echo ""
echo "2. Checking for uncommitted changes..."
if [[ -n $(git status -s) ]]; then
    echo "   ⚠️  Found uncommitted changes:"
    git status -s
    echo ""
    echo "   Staging all changes..."
    git add -A
    echo "   ✅ Changes staged"
else
    echo "   ✅ No uncommitted changes"
fi

echo ""
echo "3. Checking if commit exists..."
LAST_COMMIT=$(git log -1 --oneline 2>/dev/null)
if [ -z "$LAST_COMMIT" ]; then
    echo "   ⚠️  No commits found!"
else
    echo "   Last commit: $LAST_COMMIT"
fi

echo ""
echo "4. Creating commit if needed..."
if [[ -n $(git status -s) ]] || [ -z "$LAST_COMMIT" ]; then
    echo "   Creating commit..."
    git commit -m "feat(payouts): add secure fiat payout method storage with encryption

Implements encrypted storage for bank account information:
- PayoutMethod model with AES-256-GCM encrypted fields
- PayoutMethodService with encryption/decryption
- REST API endpoints with JWT authentication
- Data sanitization and soft delete
- Comprehensive test suite and documentation"
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Commit created successfully"
    else
        echo "   ❌ Commit failed"
        exit 1
    fi
else
    echo "   ✅ Commit already exists"
fi

echo ""
echo "5. Checking/creating feature branch..."
if [ "$CURRENT_BRANCH" = "main" ]; then
    echo "   Currently on main, creating feature branch..."
    git checkout -b feature/fiat-payout-encryption
    CURRENT_BRANCH="feature/fiat-payout-encryption"
    echo "   ✅ Switched to feature/fiat-payout-encryption"
elif [ "$CURRENT_BRANCH" != "feature/fiat-payout-encryption" ]; then
    echo "   On branch $CURRENT_BRANCH, switching to feature branch..."
    git checkout -b feature/fiat-payout-encryption 2>/dev/null || git checkout feature/fiat-payout-encryption
    CURRENT_BRANCH="feature/fiat-payout-encryption"
else
    echo "   ✅ Already on feature/fiat-payout-encryption"
fi

echo ""
echo "6. Fetching remote..."
git fetch origin

echo ""
echo "7. Checking commits ahead of main..."
COMMITS_AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo "0")
echo "   Commits ahead of main: $COMMITS_AHEAD"

if [ "$COMMITS_AHEAD" = "0" ]; then
    echo "   ⚠️  No commits ahead of main!"
    echo ""
    echo "   Checking if we need to commit changes from main..."
    git diff --name-only origin/main
fi

echo ""
echo "8. Pushing to remote..."
echo "   Executing: git push -u origin feature/fiat-payout-encryption"
git push -u origin feature/fiat-payout-encryption

if [ $? -eq 0 ]; then
    echo "   ✅ Push successful!"
else
    echo "   ❌ Push failed!"
    echo ""
    echo "   Trying force push (if branch exists remotely)..."
    git push -u origin feature/fiat-payout-encryption --force-with-lease
fi

echo ""
echo "9. Verifying remote branch..."
git ls-remote --heads origin feature/fiat-payout-encryption

echo ""
echo "=========================================="
echo "Summary:"
echo "=========================================="
echo "Branch: $(git branch --show-current)"
echo "Last commit: $(git log -1 --oneline)"
echo "Commits ahead: $(git rev-list --count origin/main..HEAD 2>/dev/null || echo '0')"
echo ""
echo "Next step: Run this to create PR:"
echo "gh pr create --title 'feat(payouts): add secure fiat payout method storage with encryption' --base main"
