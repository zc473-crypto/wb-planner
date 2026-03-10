# WB Planner — Deployment Guide

A lab-internal Western Blot membrane planning tool.
Access is controlled via Google login + admin whitelist.

---

## One-time Setup (~30 minutes, browser only)

### Step 1 — Create a Firebase project

1. Go to https://console.firebase.google.com
2. Click **"Add project"** → name it `wb-planner` → Continue
3. Disable Google Analytics (not needed) → **Create project**

### Step 2 — Enable Google Sign-In

1. In the Firebase console left menu: **Authentication** → **Get started**
2. Click **Google** → toggle **Enable** → enter your email as support email → **Save**

### Step 3 — Create Firestore database

1. Left menu: **Firestore Database** → **Create database**
2. Choose **"Start in production mode"** → select a region (e.g. `us-east1`) → **Enable**
3. Go to **Rules** tab, replace the content with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /whitelist/{email} {
      // Anyone authenticated can read their own entry
      allow read: if request.auth != null && request.auth.token.email == email;
      // Admin can read/write all entries
      allow read, write: if request.auth != null
        && request.auth.token.email == "zhihang.chen@rutgers.edu";
    }
  }
}
```

4. Click **Publish**

### Step 4 — Get your Firebase config

1. Left menu: click the ⚙ gear → **Project settings**
2. Scroll to **"Your apps"** → click **"</> Web"**
3. Register app with nickname `wb-planner-web` → **Register app**
4. You'll see a `firebaseConfig` object. Keep this tab open — you need these values in Step 7.

### Step 5 — Create a GitHub repository

1. Go to https://github.com → sign in
2. Click **"+"** → **"New repository"**
3. Name: `wb-planner` | Visibility: **Private** | **Create repository**

### Step 6 — Upload the code

1. On the new repository page, click **"uploading an existing file"**
2. You need to upload ALL files maintaining the folder structure:
   - Drag the entire `wb-planner` folder contents
   - Make sure `.github/workflows/deploy.yml` is included
3. Commit message: `Initial commit` → **Commit changes**

### Step 7 — Add Firebase secrets to GitHub

1. In your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **"New repository secret"** for each of the following
   (values come from the `firebaseConfig` object in Step 4):

| Secret name | Value from firebaseConfig |
|-------------|--------------------------|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

### Step 8 — Enable GitHub Pages

1. Repository → **Settings** → **Pages** (left sidebar)
2. Under **"Build and deployment"**: Source → **"GitHub Actions"**
3. Save

### Step 9 — Trigger first deployment

1. Repository → **Actions** tab
2. You should see a workflow run in progress (triggered by your commit)
3. Wait ~2 minutes for it to complete (green checkmark ✓)

### Step 10 — Add your authorized domain to Firebase

1. Back in Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Click **"Add domain"**
3. Enter your GitHub Pages URL: `YOUR_GITHUB_USERNAME.github.io`
4. Save

### Done! 🎉

Your app is live at: `https://YOUR_GITHUB_USERNAME.github.io/wb-planner/`

- Log in with your Google account (`zhihang.chen@rutgers.edu`) → Admin panel appears automatically
- Add lab members' Google email addresses to the whitelist
- Share the URL with your lab

---

## Adding / removing users

1. Open the app → sign in → click **⚙ Admin** button in the top nav
2. Type a colleague's Google email → click **+ Add**
3. They can now sign in immediately
4. To remove access: click **Remove** next to their name

---

## Updating the app

1. Edit files in GitHub (or ask Claude to update the code)
2. Commit changes to the `main` branch
3. GitHub Actions automatically rebuilds and redeploys (~2 min)
