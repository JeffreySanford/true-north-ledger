# PI Planning Guide - How to Use These Documents

## Document Structure

This repository contains three levels of planning documentation:

1. **PI-1-PLANNING.md** - Program Increment level (10 weeks, 5 sprints)
2. **SPRINT-X-TASKS.md** - Individual sprint task breakdowns (2 weeks each)
3. **Daily standups** - Track progress using checkbox updates

---

## How to Track Progress

### During the Sprint

**Daily:**
1. Open the current sprint task document (e.g., `SPRINT-1-TASKS.md`)
2. Find tasks you're working on
3. Update checkboxes as you complete work:
   - `[ ]` = Not started
   - `[x]` = Complete
4. Commit the updated file: `git add SPRINT-1-TASKS.md && git commit -m "chore: update sprint 1 progress"`

**Weekly:**
1. Review sprint acceptance criteria
2. Check Definition of Done for completed tasks
3. Update PI-1-PLANNING.md sprint-level checkboxes

### At Sprint End

**Sprint Review:**
1. Verify all sprint acceptance criteria met
2. Check all tasks marked `[x]` in sprint document
3. Update PI-1-PLANNING.md to mark sprint complete
4. Demo completed features to stakeholders

**Sprint Retrospective:**
1. Review "Sprint Risks" section - did they materialize?
2. Discuss "Sprint Retrospective Topics"
3. Document lessons learned
4. Update risk assessments for next sprint

### At PI End

**PI Review:**
1. Verify all PI-level acceptance criteria met
2. Check all 5 sprints completed
3. Measure PI Success Metrics
4. Conduct PI demo
5. Run PI retrospective

**PI Planning for Next Increment:**
1. Review "Post-PI Backlog Preview"
2. Prioritize features for PI-2
3. Create new PI-2-PLANNING.md document
4. Break down Sprint 6 tasks

---

## Example Workflow

### Monday Morning (Sprint Start)

```bash
# Pull latest changes
git pull

# Open current sprint tasks
code SPRINT-1-TASKS.md

# Find your assigned tasks in the breakdown
# Start with highest priority items
```

### Tuesday Afternoon (Task Complete)

```bash
# Update checkbox from [ ] to [x]
# In SPRINT-1-TASKS.md, change:
# - [ ] Create JwtStrategy class extending PassportStrategy
# to:
# - [x] Create JwtStrategy class extending PassportStrategy

# Commit the progress
git add SPRINT-1-TASKS.md
git commit -m "chore: complete JWT strategy implementation"
git push
```

### Friday (End of Week 1)

```bash
# Review sprint progress
# Count completed tasks vs total tasks
# Update team on progress toward sprint goal
# Identify any blockers or risks

# If sprint acceptance criteria item is complete:
# Update PI-1-PLANNING.md Sprint 1 section
```

### Sprint Review (End of Week 2)

```markdown
# In PI-1-PLANNING.md, update Sprint 1 acceptance criteria:

### Sprint Acceptance Criteria
- [x] JWT-based authentication working for USER actors
- [x] Service token authentication implemented
- [x] Permission guard system operational across all endpoints
- [x] Auth-related ledger events captured
- [x] Rate limiting active on all public endpoints
- [x] Integration tests validate auth flows
```

---

## Best Practices

### Task Breakdown
- Each checkbox should be completable in < 4 hours
- If a task is too large, break it into sub-tasks
- Add checkboxes for sub-tasks under main task

Example:
```markdown
- [ ] Implement Auth Controller Endpoints
  - [x] POST /api/v1/auth/login
  - [x] POST /api/v1/auth/logout
  - [ ] POST /api/v1/auth/refresh
  - [ ] POST /api/v1/auth/service-token
```

### Definition of Done
Before marking ANY checkbox `[x]`, ensure:
- Code written and follows standards
- Tests written and passing
- Code reviewed
- Documentation updated
- No critical bugs

### Acceptance Criteria
Sprint acceptance criteria should be:
- **Testable** - Can be verified objectively
- **Valuable** - Delivers user/business value
- **Achievable** - Realistic within sprint timeframe
- **Independent** - Not blocked by other sprints

### Risk Management
1. Review risks at sprint start
2. Monitor high-priority risks daily
3. Update risk status in sprint document
4. Escalate if risk becomes critical
5. Document mitigations taken

---

## Metrics to Track

### Sprint Velocity
```
Completed Tasks / Total Tasks = Sprint Completion %
```

Track this across sprints to improve estimation.

### Quality Metrics
- Test coverage percentage
- Bug count (critical, high, medium, low)
- Code review feedback volume
- E2E test pass rate

### PI Health Metrics
```
Completed Sprints / Total Sprints = PI Progress %
Completed PI Objectives / Total Objectives = PI Success %
```

---

## Quick Reference Commands

### Check Current Progress
```bash
# Count completed tasks in current sprint
grep -c "\[x\]" SPRINT-1-TASKS.md

# Count total tasks
grep -c "\[ \]" SPRINT-1-TASKS.md
grep -c "\[x\]" SPRINT-1-TASKS.md
# Add the two numbers for total
```

### Update Progress
```bash
# Edit current sprint file
code SPRINT-1-TASKS.md

# Commit progress (do this frequently!)
git add SPRINT-*.md PI-*.md
git commit -m "chore: update sprint progress - completed auth middleware"
git push
```

### Review PI Status
```bash
# View PI overview
cat PI-1-PLANNING.md | grep -A 20 "PI Objectives"

# Check sprint completion
cat PI-1-PLANNING.md | grep "Sprint.*Acceptance Criteria" -A 6
```

---

## Communication

### Daily Standup Updates
Use checkbox status to inform standup:

**Yesterday:**
- Completed JWT strategy implementation ✓
- Completed auth service tests ✓

**Today:**
- Working on permissions guard
- Working on integration tests

**Blockers:**
- None

### Weekly Sprint Progress Report
```markdown
## Sprint 1 - Week 1 Progress

**Completed:** 45/120 tasks (37.5%)

**On Track:**
- Backend auth module 60% complete
- Contract updates 80% complete

**At Risk:**
- Frontend auth service behind schedule
- E2E tests not started yet

**Blockers:**
- Waiting for design review on login page

**Plan for Week 2:**
- Complete backend auth
- Accelerate frontend work
- Start E2E tests
```

---

## Templates

### Adding New Tasks

When you discover new work during a sprint:

```markdown
#### Newly Discovered Tasks
- [ ] Task discovered during development
  - [ ] Sub-task A
  - [ ] Sub-task B
- [ ] Another new task
```

Add to sprint document and discuss in next standup.

### Bug Tracking in Sprint

```markdown
#### Bugs Found During Sprint
- [x] Bug: JWT expiration not validated - FIXED
- [ ] Bug: Permission check fails for admin - IN PROGRESS  
- [ ] Bug: Rate limit not resetting - BLOCKED (waiting for Redis config)
```

---

## Tips for Success

1. **Update checkboxes immediately** when tasks complete - don't wait
2. **Commit frequently** - daily updates minimum
3. **Be honest** about task status - partial completion is not done
4. **Break down large tasks** - if stuck, make smaller tasks
5. **Celebrate progress** - each checkbox is a win
6. **Review acceptance criteria** daily - stay focused on sprint goal
7. **Don't skip Definition of Done** - technical debt kills velocity
8. **Communicate early** when blocked - don't wait until standup

---

## Tools Integration (Optional)

While these markdown files work standalone, you can integrate with:

### GitHub Projects
- Import tasks as issues
- Track in project board
- Link PRs to tasks

### VS Code Extensions
- Markdown checkboxes extension
- Task tracking extensions
- Git lens for commit history

### Automation
```bash
# Create a pre-commit hook to validate DoD
#!/bin/bash
# .git/hooks/pre-commit

# Check if any [x] tasks are committed without tests
if git diff --cached --name-only | grep -q "SPRINT.*md"; then
  echo "✓ Sprint progress updated"
fi
```

---

## Questions?

If unclear about:
- **Task breakdown** → Ask tech lead or architect
- **Acceptance criteria** → Ask product owner
- **Definition of Done** → Refer to coding standards doc
- **Tracking process** → Refer to this guide

Keep this guide updated as the team refines the process!
