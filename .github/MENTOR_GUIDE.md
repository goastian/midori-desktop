# Good First Issue Mentor Guide

A guide for maintainers and mentors overseeing "Good First Issue" contributions.

## Your Role as a Mentor

You are the **guide and cheerleader** for new contributors. Your job is to:

✅ **Guide** — Help navigate the codebase  
✅ **Unblock** — Answer questions quickly  
✅ **Review** — Provide constructive feedback  
✅ **Celebrate** — Recognize their effort  
✅ **Retain** — Help them feel valued so they contribute again  

---

## Before You Assign the Issue

### 1. Create a High-Quality Issue Description

Spend time writing a clear issue. Bad issues waste everyone's time.

**Checklist:**
- [ ] Specific title (not "Fix bug")
- [ ] Acceptance criteria (what's "done"?)
- [ ] Step-by-step guide (how to implement)
- [ ] Links to relevant files
- [ ] Code examples (before/after)
- [ ] Test instructions (how to verify)
- [ ] Estimated time (1-4 hours)

**Example of a GOOD issue:**

```markdown
## Fix typo in settings description

### Acceptance Criteria
- [ ] Update the text in `src/components/SettingsPanel.tsx`
- [ ] Text reads "Manage your privacy settings" (currently says "Manage your privacy setting" - missing 's')
- [ ] No other changes

### Step-by-Step Guide

1. Open file: `src/components/SettingsPanel.tsx`
2. Find line 42: `const description = "Manage your privacy setting"`
3. Add 's' to "setting" → "settings"
4. Save the file

### Testing
```bash
npm run build
npm run test -- SettingsPanel.test.tsx
```

All tests should pass.

### Before You Submit
- [ ] Typo is fixed
- [ ] Tests pass
- [ ] No other changes to the file
```

---

## When Someone Expresses Interest

### Respond Quickly! ⚡

**Within 24 hours,** reply to their comment:

```markdown
@contributor-name 🎉 Welcome to Midori!

I'm assigning this to you. Here's what to do:

1. **Fork & clone** the repo (see Contributing guide)
2. **Create a branch:** `git checkout -b fix/typo-settings`
3. **Make the change** (see step-by-step guide above)
4. **Test locally:** `npm run test -- SettingsPanel`
5. **Push & open a PR** (link to PR template)

Feel free to ask questions in this issue or the PR. I'll review promptly!

Happy contributing! 💚
```

### Assign the Issue

Use GitHub's "Assign" feature to assign yourself and the contributor.

---

## During Development

### Available, But Not Overbearing

**Good:**
- ✅ Respond to questions within 24h
- ✅ Share code snippets
- ✅ Explain architecture
- ✅ Provide encouragement

**Too Much:**
- ❌ Send multiple messages without waiting for response
- ❌ Rewrite their code without explanation
- ❌ Criticize without helping

### Common Questions to Expect

| Question | Answer Template |
|----------|-----------------|
| "Where do I start?" | "Start here: [file]. Look for function X." |
| "How do I test?" | "Run: `./mach test tests/MyTest.cpp`" |
| "Can I change Y too?" | "Great idea! Let's keep this PR focused on X. File an issue for Y!" |
| "How long should this take?" | "1-2 hours typically. If stuck, ask!" |

### Red Flags (Gently Course-Correct)

**Issue:** PR is getting too large  
**Solution:** "This is looking great! The scope is growing though. Let's merge this core change first, then tackle [feature] in a separate PR."

**Issue:** Asking you to make the change  
**Solution:** "I want you to practice! Here's a hint: [explanation]. Try it and show me what you come up with!"

**Issue:** Radio silence for 2 weeks  
**Solution:** "Just checking in! Do you still want to work on this? I can help if you're stuck or reassign if needed."

---

## Code Review Tips

### Review With Kindness

Your tone in a code review can determine if someone contributes again. Be encouraging!

**Not ideal:**
```
❌ "This is wrong. You should use const, not let."
```

**Better:**
```
✅ "Good catch! One small thing: in JavaScript we prefer `const` by default. 
That prevents accidental reassignment. Can you update line 5?"
```

### Focus on Learning

This is their first contribution. Use it as a teaching moment.

```markdown
✅ Great work on fixing the typo! One learning point:

In our codebase, we prefer [pattern] because [reason].

Here's an example:
```javascript
// Prefer this:
const settings = {};

// Over this:
let settings = {};
```

This is a small preference. For your next PR, we can dive deeper into this!
```

### Provide Examples

Don't just say "fix this." Show them how:

```markdown
❌ "This needs better error handling"

✅ "This needs error handling. Try this pattern:

```javascript
try {
  const result = await fetchData();
  return result;
} catch (error) {
  console.error('Fetch failed:', error);
  return null;
}
```

Can you apply this pattern to your code?
```
```

### Keep It Short

Long reviews are overwhelming. Break feedback into:

1. **One approval comment** (acknowledge good work)
2. **Minor changes** (bullet list)
3. **Request changes** (if needed)

```markdown
✅ Looks great overall! Love the approach.

Minor changes:
- [ ] Fix typo on line 12: "setings" → "settings"
- [ ] Add comment explaining the regex pattern

That's it! Resubmit when ready.
```

---

## When They Submit a PR

### Initial Response

Reply within 24 hours, even if just reviewing:

```markdown
@contributor-name Thanks for the PR! 
Reviewing now... should have feedback by tomorrow.
```

### Give Constructive Feedback

1. **What's good?** (Always start positive)
2. **What needs change?** (Be specific)
3. **How to fix it?** (Show them)
4. **Timeline?** (When do you need it?)

```markdown
🎉 Great first PR! I love how you structured this.

A few tweaks needed:

1. **Missing test** — Can you add a test for the happy path? 
   See `tests/SettingsPanel.test.tsx` for examples.

2. **Linting** — Run `npm run format` to auto-fix style.

Once you make these changes, I'll approve & merge!

Let me know if you have questions. 💚
```

### Merge and Celebrate! 🎉

When everything is ready:

```markdown
✅ Approved! Merging now.

Congrats on your first contribution to Midori! 🎉

You've now:
- ✅ Contributed to open source
- ✅ Got code review feedback
- ✅ Helped improve Midori

Next steps:
- 🌟 Star the repo if you haven't!
- 📣 Share your PR on Twitter (we'll retweet!)
- 🚀 Ready for a bigger challenge? Check out more good-first-issues

Welcome to the Midori team! 💚
```

### Add to Contributors List

Add them to `CONTRIBUTORS.md` or GitHub auto-recognizes them.

---

## Building Long-Term Contributors

### The Transition Path

1. **Good First Issue** → Learns workflow
2. **Help Wanted** → More challenging tasks
3. **Regular Contributor** → Trusted with complex work
4. **Maintainer** → Leads projects

### How to Spot Potential Maintainers

- ✅ Consistent contributions (2+ months)
- ✅ High-quality code
- ✅ Helps other contributors
- ✅ Shows initiative (suggests improvements)

### Invite Them Up

When they've done 3-5 solid PRs:

```markdown
Hey @contributor! 

I've noticed you consistently produce great work. 
Would you be interested in:

- [ ] Reviewing PRs from other contributors?
- [ ] Taking on more complex features?
- [ ] Helping triage issues?

You've earned our trust. Let's see if maintainership interests you!
```

---

## Feedback Template Examples

### Quick Approvals

```markdown
✅ LGTM (Looks Good To Me)!

Merging now.
```

### With Minor Changes

```markdown
✅ Almost there! Just a few small tweaks:

1. Line 42: Remove `console.log` debug statement
2. Add a test case for the edge case on line 55

Resubmit when ready! 🚀
```

### With Major Changes

```markdown
Thanks for this PR! The approach is great, but I'd like to 
discuss a few things before merging:

1. **Performance** — We might want to cache this result
2. **Error handling** — What if the API fails?
3. **Testing** — Can we add tests for the edge cases?

Let's discuss in this PR thread. No rush!
```

### When You Request Changes

```markdown
I've requested changes. Here's why:

**What needs to change:**
- [ ] Add error handling for network failures
- [ ] Update test to cover the new codepath
- [ ] Fix linting error on line 78

**Why:**
- Error handling is critical for network calls
- Tests catch regressions
- Consistent code style helps readability

Questions? Ask here. Once fixed, I'll merge! 🎉
```

---

## Troubleshooting

### They're Stuck

**Your message:**
```markdown
How's it going? Stuck somewhere?

Hint: Check the `calculateHash()` function on line 23. 
You'll need to call it with the right parameters.

Show me what you try and I'll help! 💡
```

### They've Disappeared

**After 1 week of silence:**
```markdown
Just checking in! No pressure, just want to make sure 
you're not blocked. Still interested in this one?

If life got busy, totally understand. We can:
- [ ] Reassign to someone else
- [ ] Keep it open for when you're ready
- [ ] Start a different issue

Let me know! 🙂
```

### Their Code Isn't Great

**Still encourage:**
```markdown
I appreciate the effort! The code works, but 
let's refactor it together.

I'm going to push a suggestion. It's the same logic, 
just cleaner style. Take a look!

This is a learning moment — no judgment. 
Keep contributing! You'll improve fast. 💚
```

---

## Mentor Checklist

- [ ] Issue written clearly (acceptance criteria + guide)
- [ ] Responded to "I'd like to work on this" within 24h
- [ ] Available for questions (check weekly)
- [ ] Reviewed PR within 48h of submission
- [ ] Gave constructive feedback (not just "fix this")
- [ ] Approved and merged promptly
- [ ] Celebrated their contribution publicly
- [ ] Invited them to next challenge

---

## Recognition

**Thank mentors publicly:**

```markdown
🌟 Big thanks to @mentor-name for guiding our first-time 
contributors this month!

@mentor, you helped:
- @contributor1 ship their first PR
- @contributor2 learn our codebase
- @contributor3 fix a production bug

Mentorship builds community. You're awesome! 💚
```

---

<div align="center">

## Remember: Today's contributor is tomorrow's maintainer.

Your mentorship matters. Thank you! 🚀

</div>
