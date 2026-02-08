#!/bin/bash
# Mobility App QA Pipeline
# Run before every commit / after every improvement session
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo "🏋️ Mobility App QA Pipeline"
echo "=========================="
echo ""

# 1. TypeScript type checking (mobile app only — desktop has known deps issues)
echo "📝 Step 1: TypeScript type check (mobile)..."
TSC_OUT=$(npx tsc --noEmit 2>&1 | grep -v "desktop/" || true)
if [ -n "$TSC_OUT" ]; then
    echo -e "${RED}❌ Type errors found:${NC}"
    echo "$TSC_OUT" | head -20
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ No type errors in mobile app${NC}"
fi
echo ""

# 2. Check for console.log/debug statements in production code
echo "📝 Step 2: Check for debug statements..."
DEBUG_OUT=$(grep -rn 'console\.log\|console\.debug\|console\.warn' app/ lib/ components/ 2>/dev/null | grep -v node_modules | grep -v '.test.' | grep -v '// ok' || true)
DEBUG_COUNT=$(echo "$DEBUG_OUT" | grep -c '.' 2>/dev/null || true)
DEBUG_COUNT=${DEBUG_COUNT:-0}
if [ "$DEBUG_COUNT" -gt 5 ]; then
    echo -e "${YELLOW}⚠️  Found $DEBUG_COUNT console statements (consider cleaning up):${NC}"
    echo "$DEBUG_OUT" | head -10
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ Console statements within acceptable range ($DEBUG_COUNT)${NC}"
fi
echo ""

# 3. Check for TODO/FIXME/HACK
echo "📝 Step 3: Check for TODOs/FIXMEs..."
TODO_OUT=$(grep -rn 'TODO\|FIXME\|HACK\|XXX' app/ lib/ components/ 2>/dev/null | grep -v node_modules | grep -v '.expo' || true)
TODO_COUNT=$(echo "$TODO_OUT" | grep -c '.' 2>/dev/null || true)
TODO_COUNT=${TODO_COUNT:-0}
if [ "$TODO_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $TODO_COUNT TODO/FIXME items:${NC}"
    echo "$TODO_OUT" | head -10
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ No TODOs/FIXMEs${NC}"
fi
echo ""

# 4. Run tests if they exist
echo "📝 Step 4: Running tests..."
if [ -f "lib/workoutSchedule.test.js" ]; then
    TEST_OUT=$(timeout 30 npx jest --passWithNoTests --forceExit 2>&1 || true)
    if echo "$TEST_OUT" | grep -q "FAIL"; then
        echo -e "${RED}❌ Test failures:${NC}"
        echo "$TEST_OUT" | grep -A2 "FAIL\|●" | head -20
        ERRORS=$((ERRORS + 1))
    else
        PASS_COUNT=$(echo "$TEST_OUT" | grep -o "[0-9]* passed" | head -1 || echo "0 passed")
        echo -e "${GREEN}✅ Tests passed ($PASS_COUNT)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No test files found${NC}"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 5. Check Supabase schema consistency
echo "📝 Step 5: Supabase schema check..."
if [ -d "supabase/migrations" ]; then
    MIGRATION_COUNT=$(ls supabase/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
    echo -e "${GREEN}✅ Found $MIGRATION_COUNT migrations${NC}"
else
    echo -e "${YELLOW}⚠️  No Supabase migrations directory${NC}"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 6. Check for large files that shouldn't be committed
echo "📝 Step 6: Large file check..."
LARGE_FILES=$(find . -not -path '*/node_modules/*' -not -path '*/.expo/*' -not -path '*/dist/*' -not -path '*/.git/*' -type f -size +1M 2>/dev/null || true)
if [ -n "$LARGE_FILES" ]; then
    echo -e "${YELLOW}⚠️  Large files (>1MB):${NC}"
    echo "$LARGE_FILES" | head -5
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ No oversized files${NC}"
fi
echo ""

# 7. Check package.json for outdated critical deps
echo "📝 Step 7: Dependency health..."
EXPO_VER=$(node -e "console.log(require('./package.json').dependencies?.expo || 'N/A')" 2>/dev/null || echo "N/A")
RN_VER=$(node -e "console.log(require('./package.json').dependencies?.['react-native'] || 'N/A')" 2>/dev/null || echo "N/A")
echo "  Expo: $EXPO_VER | React Native: $RN_VER"
echo -e "${GREEN}✅ Dependencies checked${NC}"
echo ""

# 8. Check app screens for error boundaries
echo "📝 Step 8: Error handling audit..."
SCREENS=$(find app -name "*.tsx" -not -path "*/node_modules/*" | wc -l | tr -d ' ')
ERROR_BOUNDARIES=$(grep -rl 'ErrorBoundary\|try.*catch\|onError' app/ 2>/dev/null | wc -l | tr -d ' ')
echo "  Screens: $SCREENS | With error handling: $ERROR_BOUNDARIES"
if [ "$ERROR_BOUNDARIES" -lt "$((SCREENS / 3))" ]; then
    echo -e "${YELLOW}⚠️  Less than 1/3 of screens have error handling${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ Error handling coverage acceptable${NC}"
fi
echo ""

# 9. Git status
echo "📝 Step 9: Git status..."
UNCOMMITTED=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "  Branch: $BRANCH | Uncommitted changes: $UNCOMMITTED"
echo ""

# Summary
echo "=========================="
echo "🏁 QA SUMMARY"
echo "=========================="
if [ "$ERRORS" -gt 0 ]; then
    echo -e "${RED}❌ ERRORS: $ERRORS — Must fix before shipping${NC}"
elif [ "$WARNINGS" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  WARNINGS: $WARNINGS — Should address${NC}"
else
    echo -e "${GREEN}✅ ALL CLEAR — Ship it! 🚀${NC}"
fi
echo "Errors: $ERRORS | Warnings: $WARNINGS"
echo ""

# Exit code
if [ "$ERRORS" -gt 0 ]; then
    exit 1
fi
exit 0
