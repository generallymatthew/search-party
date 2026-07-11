# Deployment Guide

## macOS (Launchd)

### Automatic Setup

```bash
bash install-service.sh
```

This creates a service that:
- Auto-starts on login
- Auto-restarts on crash
- Logs to `logs/stdout.log` and `logs/stderr.log`

### Management

```bash
# Check status
bash manage-service.sh status

# Start service
bash manage-service.sh start

# Stop service
bash manage-service.sh stop

# Restart service
bash manage-service.sh restart

# View logs
bash manage-service.sh logs

# View errors
bash manage-service.sh errors

# Uninstall service
bash manage-service.sh uninstall
```

---

## Linux (Systemd)

### Manual Setup

Create `/etc/systemd/system/job-radar.service`:

```ini
[Unit]
Description=JobRadar - Automated Job Search Agent
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/job-radar
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

### Enable & Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable job-radar
sudo systemctl start job-radar

# Check status
sudo systemctl status job-radar

# View logs
sudo journalctl -u job-radar -f
```

---

## Docker

### Build Image

```bash
docker build -t job-radar:latest .
```

### Run Container

```bash
# With named volume for data persistence
docker run -d \
  --name job-radar \
  -p 9090:9090 \
  -v jobdata:/app/data \
  job-radar:latest
```

### Management

```bash
# View logs
docker logs -f job-radar

# Stop container
docker stop job-radar

# Start container
docker start job-radar

# Remove container
docker rm job-radar
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  job-radar:
    build: .
    container_name: job-radar
    ports:
      - "9090:9090"
    volumes:
      - jobdata:/app/data
    environment:
      - NODE_ENV=production
      - PORT=9090
      - DB_PATH=/app/data/jobs.db
    restart: always

volumes:
  jobdata:
    driver: local
```

Start with:

```bash
docker-compose up -d
```

---

## Environment Variables

Create `.env` in project root (see `.env.example`):

```env
# Application
NODE_ENV=production
PORT=9090
DB_PATH=./data/jobs.db

# Job Search
JOB_TITLE=UX Designer
SEARCH_LOCATIONS=remote,Raleigh NC,Durham NC,Chapel Hill NC
NOTIFY_FREQUENCY=daily

# Email Notifications (optional)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NOTIFY_EMAIL=your-email@gmail.com
```

---

## Troubleshooting Deployment

### Service Won't Start

```bash
# Check logs
bash manage-service.sh errors

# Verify npm is in PATH
which npm

# Verify Node version
node --version
```

### Port Already in Use

```bash
# Find process using port 9090
lsof -i :9090

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=9091
```

### Database Locked

```bash
# Stop service
bash manage-service.sh stop

# Remove lock
rm data/jobs.db-shm data/jobs.db-wal

# Start service
bash manage-service.sh start
```

### Out of Memory

Increase Node memory:

```bash
# In service file or docker-compose
NODE_OPTIONS=--max_old_space_size=2048
```

---

## Scaling

For production deployments with 10,000+ jobs:

1. **Increase timeout values** in scrapers
2. **Add caching layer** (Redis) for API responses
3. **Implement pagination** in API endpoints
4. **Run searches offline**, store results in database
5. **Use process manager** (PM2) instead of systemd

See [ARCHITECTURE.md](ARCHITECTURE.md) for scaling patterns.
