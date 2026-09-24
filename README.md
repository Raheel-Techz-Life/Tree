# Family Tree

A shared family tree for a whole family, not one person's browser. Several relatives sign in
with their own email and edit the same tree; changes appear on everyone's screen within a
second. Runs locally with `npm run dev`, or deploys to Vercel with one command.

## What it does

- **Real genealogy, not a binary tree.** People are linked by parent→child edges and by
  unions (marriage/partnership). A child can have one parent, two, or an adopted pair. A person
  can have several marriages. Half-siblings, in-laws and married-in branches all lay out
  correctly — these break a strict parent/child tree, which is why the data model isn't one.
- **Names, photos, and living status** on every card. Photos upload to private storage; only
  members of your tree can see them. Deceased people get a dashed border and a †.
- **Invite codes with roles.** You're admin. You generate a code or link; relatives sign in
  with their own email and get *editor* (can add and change people) or *viewer* (read-only).
  You can change roles or revoke access at any time.
- **Change history.** Every add, edit and delete is logged with who did it and when.
- **Export / import JSON** so you always have your own copy of the data.
- **Live updates** — when your uncle adds his kids, your screen updates without a refresh.

## Setup — about 10 minutes

### 1. Create a Supabase project (free)

Go to [supabase.com](https://supabase.com) → **New project**. Pick a region near you
(`ap-south-1` Mumbai is closest to Karnataka). Wait for it to finish provisioning.

### 2. Create the database

In the Supabase dashboard: **SQL Editor** → **New query** → paste the entire contents of
`supabase/schema.sql` → **Run**.

This creates every table, the row-level security policies, the invite/role functions, the
audit triggers, the private photo bucket, and turns on realtime. It is safe to re-run.

### 3. Turn on email sign-in

**Authentication → Sign In / Providers → Email**: make sure Email is enabled.
Leave "Confirm email" on. The app uses 6-digit codes, not magic links, so you do **not**
need to configure redirect URLs.

> Supabase's built-in email sender is rate-limited (a few messages per hour) — fine while you
> and a few relatives sign up. If you're onboarding a large family at once, add an SMTP
> provider under **Authentication → Emails → SMTP Settings**.

### 4. Configure the app

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The anon key is meant to be public — row-level security is what protects the data, not the key.

### 5. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, sign in with your email, and create your first tree.

### 6. Deploy to Vercel (optional, but needed for relatives to use it)

```bash
npx vercel
```

Then in the Vercel dashboard → **Settings → Environment Variables**, add the same three
variables, setting `NEXT_PUBLIC_SITE_URL` to your real URL
(`https://your-app.vercel.app`). Redeploy.

Relatives cannot reach `localhost` on your machine, so the app has to be deployed for
multi-person editing to actually work.

## More than one tree

Nothing is tied to a single family. One account can hold any number of trees — your father's
side, your mother's side, your in-laws — each with its own members, invite codes and roles.
The **Your family trees** screen lists every tree you belong to; **Create** starts another.

Membership is per tree, so a cousin invited to one tree sees only that one. The same person
can appear in two different trees, but they are separate records: the trees are independent,
not linked. If you later want them merged, export both to JSON and import one into the other.

## How to build your tree

Start with the **oldest** relative you know, not yourself — the tree grows downward, and
starting at the top means you never have to reorganise.

1. Add your oldest known ancestor. Then **+ Spouse** for his wife.
2. Select him → **+ Child** for your grandfather. The dialog offers to record the wife as the
   other parent — leave that on. *Recording both parents is what keeps siblings grouped
   correctly; a child linked to only one parent gets its own little branch.*
3. Your grandfather's two sisters: select your grandfather → **+ Sibling** twice. They
   automatically get the same parents.
4. Select your grandfather → **+ Spouse**, then **+ Child** five times for his sons.
5. For each son: **+ Spouse**, then **+ Child** for their kids. Repeat down the generations.

**+ Parent** works upward if you discover an earlier generation later.

Every "add" dialog also lets you **link someone already in the tree** instead of creating a
new person — use that when two branches turn out to be connected (cousins marrying, for
instance).

### Inviting the family

**People with access → Create invite → Copy link.** Send it on WhatsApp. They open it, sign in
with their own email, and land directly in the tree. Codes last 30 days, work up to 25 times,
and can be revoked.

Give *editor* to people who will actually add relatives, *viewer* to everyone else. You can
promote a reliable cousin to *admin* so they can invite people too.

## On a phone

Most relatives will only ever open this on a phone, so it is built for one.

- **One-finger drag** pans, **two-finger pinch** zooms. A tap that doesn't move selects a
  person — there is no separate "drag mode" to switch into.
- Tapping someone opens their details as a **bottom sheet**, and the tree slides up just far
  enough to keep that person visible above it.
- The toolbar collapses to **search**, **+ Person** and a **menu** holding access, history,
  export and import.
- Add it to your home screen (iOS: Share -> Add to Home Screen; Android: menu -> Add to Home
  screen) and it opens full-screen without browser chrome.
- **Upload photo** opens the camera directly, so you can photograph an old print on the spot.

Zoom never shrinks below a legible size, even on a very wide family — you pan instead of
squinting at 25%.

## Things worth knowing

- **Dates are free text on purpose.** `1942`, `c. 1950` and `March 1911` are all valid.
  Real genealogy data is vague, and a strict date column would force you to invent precision
  you don't have. Sorting pulls the first 4-digit year it finds.
- **Deleting a person deletes their links**, and there is no undo. The change history records
  what was removed, but restoring it means re-entering it. Export regularly.
- **Photos are private.** They live in a bucket only tree members can read, served through
  short-lived signed URLs. They are not on a public CDN.
- **Security is enforced in the database, not the UI.** Hiding the Edit button from a viewer
  is cosmetic; the RLS policies are what actually stop a viewer from writing. Don't disable
  them.
- **The one weak spot in the layout**: if both halves of a marriage have their own recorded
  ancestors, only one side can sit under its parents — the other gets a long connecting line.
  Every genealogy program has this problem; it is a property of the data, not a bug.

## Project layout

```
supabase/schema.sql          Tables, RLS, RPCs, audit triggers, photo bucket — run this first
src/lib/layout.ts            Generation assignment + recursive block layout
src/lib/types.ts             Shared types
src/components/TreeCanvas    Pan/zoom SVG renderer
src/components/Workspace     State, realtime, all mutations
src/components/*Modal        Person editor, relationship linker, members, history
scripts/smoke.ts             Layout test — asserts no overlaps, children below parents,
                             spouses aligned, sibling groups intact; writes an SVG preview
```

Run the layout test with `npx tsx scripts/smoke.ts /tmp/tree.svg`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Not configured" on the home page | `.env.local` missing or dev server not restarted after creating it |
| Sign-in code never arrives | Supabase's built-in email rate limit; wait an hour or add SMTP |
| "invite code not found" | Typo, or the code was revoked. Codes are case-insensitive |
| Tree loads empty for a relative | They joined a *different* tree — check **People with access** |
| Photos show as blank circles | The `photos` bucket wasn't created; re-run `schema.sql` |
| Changes don't appear live | Realtime wasn't enabled; re-run the last section of `schema.sql` |
