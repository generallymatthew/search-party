#!/bin/bash

# Job Search Agent - macOS Launchd Service Installer

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLIST_FILE="$HOME/Library/LaunchAgents/com.jobsearch.agent.plist"

echo "📦 Installing Job Search Agent as background service..."
echo "Project directory: $PROJECT_DIR"

# Create the launchd plist file
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jobsearch.agent</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>dist/server.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/stderr.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Build the project
echo "🔨 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Make sure dependencies are installed: npm install"
    exit 1
fi

# Unload existing service if running
launchctl unload "$PLIST_FILE" 2>/dev/null

# Load the service
echo "🚀 Loading service..."
launchctl load "$PLIST_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Service installed and started!"
    echo ""
    echo "Commands to manage the service:"
    echo "  Start:   launchctl start com.jobsearch.agent"
    echo "  Stop:    launchctl stop com.jobsearch.agent"
    echo "  Reload:  launchctl unload $PLIST_FILE && launchctl load $PLIST_FILE"
    echo "  Logs:    tail -f $PROJECT_DIR/logs/stdout.log"
    echo "  Errors:  tail -f $PROJECT_DIR/logs/stderr.log"
    echo ""
    echo "The agent is now running at http://localhost:3000"
    echo "It will automatically restart if it crashes."
else
    echo "❌ Failed to load service. Check the plist file."
    exit 1
fi
