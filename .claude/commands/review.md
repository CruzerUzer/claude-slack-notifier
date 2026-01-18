# Code Review

Perform a comprehensive code review of the specified files or recent changes.

## Target

$ARGUMENTS specifies what to review:
- A file path: Review that specific file
- "changes" or "diff": Review uncommitted changes
- "pr" or "branch": Review current branch vs main

## Review Checklist

### 1. Code Quality
- [ ] Clear, descriptive naming
- [ ] Functions are focused and reasonably sized
- [ ] No obvious code smells or anti-patterns
- [ ] Async/await patterns correct

### 2. Error Handling
- [ ] Errors are handled appropriately
- [ ] Error messages are helpful
- [ ] No silent failures
- [ ] Slack API errors handled

### 3. Security
- [ ] No hardcoded secrets or credentials
- [ ] Environment variables for sensitive data
- [ ] Input validation where needed
- [ ] tmux commands properly escaped

### 4. Performance
- [ ] No memory leaks (timers cleaned up)
- [ ] Async operations non-blocking
- [ ] No unnecessary polling

## Output Format

Provide findings organized by severity:

### Critical
Issues that must be fixed before merge.

### Important
Issues that should be addressed.

### Suggestions
Optional improvements and nitpicks.

### Highlights
Things done well worth noting.

---

End with a summary and overall recommendation.
