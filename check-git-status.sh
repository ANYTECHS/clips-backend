#!/bin/bash

echo "=== Current Branch ==="
git branch --show-current

echo ""
echo "=== All Local Branches ==="
git branch -a

echo ""
echo "=== Last 5 Commits ==="
git log --oneline -5

echo ""
echo "=== Remote Status ==="
git remote -v

echo ""
echo "=== Fetch latest from remote ==="
git fetch origin

echo ""
echo "=== Compare with remote main ==="
git log origin/main..HEAD --oneline

echo ""
echo "=== Files changed in current branch ==="
git diff --name-only origin/main

echo ""
echo "=== Uncommitted changes ==="
git status --short
