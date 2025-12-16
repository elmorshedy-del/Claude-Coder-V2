# Custom Local Domain Setup

## Option 1: Custom .local domain (Free)

1. Edit hosts file:
```bash
sudo nano /etc/hosts
```

2. Add this line:
```
127.0.0.1 claude.local
```

3. Save (Ctrl+X, Y, Enter)

4. Access at: **http://claude.local:3000**

## Option 2: ngrok tunnel (Free, works from anywhere)

1. Install:
```bash
brew install ngrok
```

2. Run:
```bash
ngrok http 3000
```

3. Use the https URL it gives you (e.g., https://abc123.ngrok.io)

## Option 3: Change port

Edit package.json:
```json
"dev": "next dev -p 8080"
```

Access at: **http://localhost:8080**
