#!/bin/bash

# Job Search Agent - Service Management

SERVICE="com.jobsearch.agent"
PLIST="$HOME/Library/LaunchAgents/${SERVICE}.plist"
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

case "$1" in
  start)
    echo "Starting $SERVICE..."
    launchctl start "$SERVICE"
    echo "✅ Service started"
    ;;
  stop)
    echo "Stopping $SERVICE..."
    launchctl stop "$SERVICE"
    echo "✅ Service stopped"
    ;;
  restart)
    echo "Restarting $SERVICE..."
    launchctl stop "$SERVICE"
    sleep 2
    launchctl start "$SERVICE"
    echo "✅ Service restarted"
    ;;
  reload)
    echo "Reloading $SERVICE..."
    launchctl unload "$PLIST"
    sleep 1
    launchctl load "$PLIST"
    echo "✅ Service reloaded"
    ;;
  status)
    if launchctl list | grep -q "$SERVICE"; then
      echo "✅ Service is running"
      echo ""
      echo "Access at: http://localhost:3000"
      echo ""
      curl -s http://localhost:3000/api/stats 2>/dev/null | grep -o '"totalJobs":[0-9]*' || echo "Status: Unable to connect"
    else
      echo "❌ Service is not running"
    fi
    ;;
  logs)
    echo "=== STDOUT ==="
    tail -f "$PROJECT_DIR/logs/stdout.log"
    ;;
  errors)
    echo "=== STDERR ==="
    tail -f "$PROJECT_DIR/logs/stderr.log"
    ;;
  uninstall)
    echo "Uninstalling $SERVICE..."
    launchctl unload "$PLIST"
    rm "$PLIST"
    echo "✅ Service uninstalled"
    ;;
  *)
    echo "Job Search Agent Service Manager"
    echo ""
    echo "Usage: $0 {start|stop|restart|reload|status|logs|errors|uninstall}"
    echo ""
    echo "Commands:"
    echo "  start      - Start the service"
    echo "  stop       - Stop the service"
    echo "  restart    - Restart the service"
    echo "  reload     - Reload configuration and restart"
    echo "  status     - Check if service is running"
    echo "  logs       - View live logs (stdout)"
    echo "  errors     - View error logs (stderr)"
    echo "  uninstall  - Remove the service"
    echo ""
    exit 1
    ;;
esac
