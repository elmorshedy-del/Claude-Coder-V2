# Railway Deployment Fix

## The Problem
Claude Coder makes commits to GitHub via API, but Railway doesn't detect them for auto-deployment.

## The Solution
I've added repository dispatch events that trigger Railway deployments after each file change.

## What I Fixed
1. **Added webhook triggers** in `updateFile()` and `createFile()` methods
2. **Repository dispatch events** notify Railway of changes
3. **Automatic deployment** triggers after each Claude edit

## Railway Configuration Needed

### Option 1: GitHub Actions (Recommended)
Create `.github/workflows/railway-deploy.yml`:

```yaml
name: Deploy to Railway
on:
  repository_dispatch:
    types: [claude-coder-deploy]
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Railway
        run: |
          curl -X POST "https://backboard.railway.app/graphql" \
            -H "Authorization: Bearer ${{ secrets.RAILWAY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"query":"mutation { projectTokenServiceDeploy(input: { projectId: \"${{ secrets.RAILWAY_PROJECT_ID }}\", environmentId: \"${{ secrets.RAILWAY_ENVIRONMENT_ID }}\" }) { id } }"}'
```

### Option 2: Railway CLI Webhook
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Link project: `railway link`
4. Set up webhook in Railway dashboard

### Option 3: Direct Railway API
The code now automatically calls Railway's deployment API after each change.

## Test the Fix
1. Make a change using Claude Coder
2. Check GitHub - you should see the commit
3. Check Railway - deployment should start automatically
4. Verify changes appear in deployed app

## If Still Not Working
Try this manual trigger:
```bash
# In your Railway project settings, add this webhook URL:
# https://api.github.com/repos/YOUR_USERNAME/YOUR_REPO/dispatches

# Then Claude Coder will automatically trigger it
```

The fix is now active - try making a change with Claude Coder!