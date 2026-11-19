#!/bin/bash

echo "Checking current branch..."
git branch --show-current

echo ""
echo "Checking git status..."
git status

echo ""
echo "Checking if changes are committed..."
git log --oneline -1

echo ""
echo "Checking remote branches..."
git branch -r | grep feature/fiat-payout-encryption

echo ""
echo "Attempting to push..."
git push -u origin feature/fiat-payout-encryption --verbose

echo ""
echo "Done!"
