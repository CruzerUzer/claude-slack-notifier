# Test and Commit

Run quality checks and create a commit with the current changes.

## Arguments

$ARGUMENTS should contain the commit message or "auto" for auto-generated message.

## Process

### Step 1: Check for Changes

```bash
git status
git diff --stat
```

If no changes, inform user and exit.

### Step 2: Run Quality Checks

```bash
# Test health endpoint (if service is running)
curl -s http://localhost:3847/health

# Check for syntax errors
node --check index.js
```

### Step 3: Handle Failures

If any check fails:
1. Show the errors clearly
2. Ask if user wants to:
   - Fix the issues automatically (if possible)
   - Continue anyway (for non-critical issues)
   - Abort the commit

### Step 4: Stage and Commit

If $ARGUMENTS is "auto":
1. Analyze the changes
2. Generate a descriptive commit message following conventional commits:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `refactor:` for refactoring
   - `docs:` for documentation
   - `chore:` for maintenance

Otherwise use the provided commit message.

```bash
git add -A
git commit -m "<message>"
```

### Step 5: Suggest Next Steps

After successful commit:
- Show the commit hash
- Suggest `git push` if ready
- Mention if there are more uncommitted changes
