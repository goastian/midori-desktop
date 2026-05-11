# 🚀 Quick Start Guide - Midori GitHub Optimization

Get Midori's contributor program live in the next 48 hours.

---

## 📋 Prerequisites (5 min)

- [ ] Admin access to GitHub repository
- [ ] GitHub Actions enabled
- [ ] 1-2 core team members available
- [ ] List of 5-10 potential mentors

---

## ⚡ Quick Setup (Day 1 - 2 hours)

### Step 1: Push Files to Repository (15 min)

```bash
cd midori-desktop

# Verify files created
ls -la README.md CONTRIBUTING.md
ls -la .github/ISSUE_TEMPLATE/
ls -la .github/*.md

# Commit & push
git add .
git commit -m "feat: GitHub optimization - SEO, contributor program, discussions setup"
git push origin main
```

### Step 2: Create Labels in GitHub (30 min)

Go to: **Settings → Labels**

**Quick method:**
Use GitHub CLI:

```bash
# Install if needed: brew install gh
gh label create "good-first-issue" \
  --color "7057ff" \
  --description "Perfect for first-time contributors"

gh label create "help-wanted" \
  --color "033366" \
  --description "Extra attention needed"

gh label create "critical" \
  --color "b60205" \
  --description "Critical issue (P0)"

gh label create "area: sync" \
  --color "0075ca" \
  --description "Data sync component"

# See LABELS_GUIDE.md for all labels
```

**Or manually:** Settings → Labels → "New label" (50 labels)

### Step 3: Set Up GitHub Discussions (30 min)

Go to: **Settings → Discussions**

- [ ] Enable Discussions
- [ ] Create categories:

```
1. 🎉 Announcements (maintainers only)
2. 💬 General Discussion
3. ❓ Getting Help
4. 🤔 Q&A
5. 💡 Ideas
6. 🎨 Showcase
7. 🐛 Bugs
8. 🧑‍💻 Development
9. 🌍 Community & Events
```

- [ ] Pin announcement: "Welcome to Midori Discussions!"

```markdown
# 👋 Welcome to Midori Browser Discussions

This is our community hub for:
- 💬 Discussions and conversations
- ❓ Asking questions
- 💡 Sharing ideas
- 🎨 Showing off projects
- 🤝 Building community

👉 [Check out our first-time contributor program](../issues?q=label%3Agood-first-issue)

Let's build Midori together! 💚
```

### Step 4: Create Initial Good First Issues (30 min)

Create 3-5 starter issues:

```markdown
Title: [Good First Issue] Fix typo in privacy settings description
Label: good-first-issue, type:ui, area:settings, effort:small
Mentor: @maintainer1

Description:
## Acceptance Criteria
- [ ] Text in settings.js updated
- [ ] Says "Manage your privacy settings" (not "setting")

## Step-by-Step
1. Open: src/components/SettingsPanel.tsx (line 42)
2. Change: "setting" → "settings"
3. Test: npm run test -- SettingsPanel

[See template for full format]
```

(Use template from `.github/ISSUE_TEMPLATE/good_first_issue.md`)

---

## 📢 Launch & Promote (Day 2 - 2 hours)

### Step 1: Announce on Social Media (30 min)

**Twitter:**

```
🌟 NEW: Join Midori's Contributor Program!

We're recruiting first-time open source contributors.

✅ 15+ beginner-friendly tasks (1-4 hours each)
✅ Mentors assigned to each issue  
✅ Step-by-step guides included
✅ Learn by contributing to real project

Ready to make your first contribution?
👉 https://github.com/goastian/midori-desktop/issues?q=label%3Agood-first-issue

#OpenSource #FirstContribution #MidoriBrowser
```

**Other channels:**
- Reddit: /r/opensource, /r/programming
- LinkedIn: Tag Midori/Astian
- Community forums: astian.org
- Email newsletter (if applicable)

### Step 2: Pin Good First Issues (15 min)

In each issue, add pinned comment:

```markdown
👋 This is a Good First Issue!

Perfect for first-time contributors. Here's what to do:

1. Read the guide above ↑
2. Fork the repo
3. Make the changes
4. Open a PR (see CONTRIBUTING.md)

Your mentor: @mentor-name

Questions? Comment here! 💚

**Ready?** Reply "I'd like to work on this!" ⬇️
```

### Step 3: Setup Initial Discussion Posts (15 min)

Create welcome post in Announcements:

```markdown
# 🚀 Welcome to Midori Browser Community

Midori is a fast, secure, privacy-first browser built on Firefox.

## Get Involved

- 🐛 **Report bugs:** Use issues
- 💡 **Suggest features:** Open a discussion
- 👨‍💻 **Contribute code:** Check [good-first-issues](https://github.com/goastian/midori-desktop/issues?q=label%3Agood-first-issue)
- 📚 **Improve docs:** Edit our documentation
- 🌍 **Translate:** Help localize Midori

[Learn more in CONTRIBUTING.md](../blob/main/CONTRIBUTING.md)
```

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] README displays with new badges
- [ ] CONTRIBUTING.md is accessible
- [ ] Good First Issues show "good-first-issue" label
- [ ] Issue templates appear when creating issue
- [ ] Discussions work and have categories
- [ ] Discussion posts are visible
- [ ] Labels work in issue filtering
- [ ] Social media posts are live

---

## 📊 Track First Contributors

Watch for activity:

**Daily checks:**
```bash
# View good first issues with activity
gh issue list --label good-first-issue --state all

# View recent discussions
gh discussion list --limit 10
```

**Success indicators:**
- ✅ First "I'd like to work on this!" comment
- ✅ First fork
- ✅ First PR from new contributor
- ✅ First merged PR

---

## 🎯 Mentor Responsibilities

Share with assigned mentors:

**For each good first issue, you will:**

1. ✅ **Respond within 24h** when someone expresses interest
2. ✅ **Provide guidance** if they get stuck (max 48h response)
3. ✅ **Review their PR** within 48h of submission
4. ✅ **Give constructive feedback** (be kind!)
5. ✅ **Celebrate** when they merge (public recognition)

**Time commitment:** ~30 min per issue

See [MENTOR_GUIDE.md](MENTOR_GUIDE.md) for full details.

---

## 🚨 Common Issues & Fixes

### Issue: "I clicked 'New Issue' but no templates appeared"

**Fix:** 
- Clear browser cache
- Refresh page
- Check `.github/ISSUE_TEMPLATE/` files are committed

### Issue: "Discussions aren't showing categories"

**Fix:**
- Go to Settings → Discussions → Create categories manually
- Categories take 5-10 minutes to appear

### Issue: "Labels don't show in issue list"

**Fix:**
- Wait 5 minutes for GitHub cache refresh
- Or refresh browser

### Issue: "No mentors responded to first contributor"

**Fix:**
- Set reminders for mentors
- Create a Slack/Discord reminder bot
- Rotate mentors weekly

---

## 📈 Month 1 Goals

Track these metrics:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Good First Issues Created | 10+ | — | — |
| New Contributors | 2-3 | — | — |
| PRs Merged | 80%+ | — | — |
| Mentor Response Time | <24h avg | — | — |
| GitHub Stars | +100 | — | — |
| Discussion Posts | 50+ | — | — |

---

## 🎓 Additional Resources

If you need help with specific tasks:

| Task | Resource |
|------|----------|
| Create good first issues | [GOOD_FIRST_ISSUE_PLAN.md](GOOD_FIRST_ISSUE_PLAN.md) (Phase 2) |
| Set up discussions | [DISCUSSIONS_SETUP.md](DISCUSSIONS_SETUP.md) |
| Create labels | [LABELS_GUIDE.md](LABELS_GUIDE.md) |
| Mentor contributors | [MENTOR_GUIDE.md](MENTOR_GUIDE.md) |
| See full plan | [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) |

---

## 🆘 Need Help?

### Setup Questions
→ Check `.github/` documentation files

### Contributor Questions  
→ Direct to [GitHub Discussions](https://github.com/goastian/midori-desktop/discussions)

### Mentor Support
→ Create private Slack channel for mentors

### General
→ Email core team or create issue

---

## 🎉 Quick Wins (Easy Stuff to Do Today)

- ⭐ [x] Push all files to GitHub
- ⭐ [x] Create 10 labels
- ⭐ [x] Enable Discussions
- ⭐ [x] Create 3-5 good-first-issues
- ⭐ [x] Post on Twitter
- ⭐ [x] Pin welcome post
- ⭐ [x] Send mentor reminders

---

<div align="center">

## You've Got This! 🚀

Everything is prepared. Time to ship.

**First contributor incoming in:** 3... 2... 1...

Questions? See the docs in `.github/` 

Good luck! 💚

</div>

---

**Total Setup Time:** 4-5 hours  
**Result:** Launch a sustainable contributor program  
**Expected Impact:** 10-20 new contributors in first month
