# Troubleshooting Guide

## Common Issues

### "No jobs found"

**Symptoms**: Dashboard shows 0 jobs or very few jobs

**Solutions**:

1. **Check if scraper is enabled**
   - Open Job Boards modal
   - Verify boards show job counts > 0

2. **Verify search locations**
   - Job boards use specific location names
   - LinkedIn: "San Francisco, CA" vs "San Francisco"
   - Try broader location like "United States"

3. **Check logs**
   ```bash
   bash manage-service.sh logs
   bash manage-service.sh errors
   ```

4. **Manual search**
   ```bash
   curl -X POST http://localhost:9090/api/search/now
   ```
   Wait 5-10 minutes, then check dashboard

5. **Restart service**
   ```bash
   bash manage-service.sh restart
   ```

---

### "Scrapers timing out"

**Symptoms**: 
```
Error: page.goto: Timeout 15000ms exceeded
```

**Causes**:
- Site is slow to load
- Bot detection is blocking
- Network is slow
- Too many requests at once

**Solutions**:

1. **Increase timeout** in scraper (e.g., `src/scrapers/linkedin.ts`):
   ```typescript
   // Change from 15000ms to 30000ms
   await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
   ```

2. **Add retry logic**:
   ```typescript
   let retries = 3
   while (retries > 0) {
     try {
       await page.goto(url, { timeout: 15000 })
       break
     } catch (e) {
       retries--
       await page.waitForTimeout(5000)
     }
   }
   ```

3. **Check your internet**
   ```bash
   ping google.com
   ```

4. **Wait and retry later**
   - Some sites rate-limit aggressive scrapers
   - Try running search in off-peak hours

---

### "Scrapers return 0 results (broken selectors)"

**Symptoms**: 
- Job board modal shows 0 jobs for a board
- Logs show no errors but no jobs either

**Causes**:
- Job board changed HTML structure
- CSS selectors are outdated
- API endpoint changed

**Solutions**:

1. **Inspect the site manually**
   - Visit job board in browser
   - Right-click job card → Inspect
   - Find new CSS selector

2. **Update scraper**
   Example: `src/scrapers/linkedin.ts`
   
   ```typescript
   // Old selector (broken)
   const titleEl = el.querySelector('.base-search-card__title')
   
   // New selector (from inspection)
   const titleEl = el.querySelector('.jobs-search-results__list-item-title')
   ```

3. **Rebuild and test**
   ```bash
   npm run build
   bash manage-service.sh restart
   
   # Trigger search
   curl -X POST http://localhost:9090/api/search/now
   ```

4. **Report to community**
   - Open GitHub Issue
   - Include board name and error
   - Submit PR with fix (see [CONTRIBUTING.md](../CONTRIBUTING.md))

---

### "Email not sending"

**Symptoms**:
- Dashboard loads fine
- Search finds jobs
- But no email received

**Solutions**:

1. **Verify Gmail credentials**
   ```bash
   # Check .env file
   cat .env | grep GMAIL
   ```

2. **Ensure Gmail app password**
   - ❌ Regular Gmail password won't work
   - ✅ Use [app password](https://myaccount.google.com/apppasswords)
   - Requires 2FA enabled

3. **Check email logs**
   ```bash
   bash manage-service.sh logs | grep -i email
   ```

4. **Test email sending**
   ```bash
   # Manually trigger email
   curl -X POST http://localhost:9090/api/search/now
   
   # Wait 10 seconds, check inbox
   ```

5. **Check spam folder**
   - Gmail may categorize as spam
   - Add to contacts to whitelist

---

### "Database locked" or "SQLite error"

**Symptoms**:
```
SqliteError: database is locked
SQLITE_CANTOPEN: unable to open database file
```

**Solutions**:

1. **Stop service and clear locks**
   ```bash
   bash manage-service.sh stop
   rm data/jobs.db-shm data/jobs.db-wal
   bash manage-service.sh start
   ```

2. **Check file permissions**
   ```bash
   ls -la data/
   # Should show: -rw-r--r-- jobs.db
   
   # Fix if needed
   chmod 644 data/jobs.db
   ```

3. **Backup and reset database**
   ```bash
   cp data/jobs.db data/jobs.db.backup
   rm data/jobs.db
   bash manage-service.sh restart
   ```

---

### "Port already in use"

**Symptoms**:
```
Error: listen EADDRINUSE: address already in use :::9090
```

**Solutions**:

1. **Find process using port**
   ```bash
   lsof -i :9090
   ```

2. **Kill process**
   ```bash
   kill -9 <PID>
   ```

3. **Or change port in .env**
   ```env
   PORT=9091
   ```

---

### "Out of memory" or "heap out of memory"

**Symptoms**:
```
JavaScript heap out of memory
```

**Causes**:
- Large number of jobs (10,000+)
- Memory leak in scraper
- Long-running process

**Solutions**:

1. **Increase Node memory**
   
   Edit `.env`:
   ```env
   NODE_OPTIONS=--max_old_space_size=4096
   ```

2. **Restart service**
   ```bash
   bash manage-service.sh restart
   ```

3. **Archive old jobs**
   ```bash
   # Delete jobs older than 90 days
   npm run cleanup
   ```

---

### "Dashboard loads but no jobs appear"

**Symptoms**:
- http://localhost:9090 loads
- Page shows "No jobs found"
- Stats show 0 total jobs

**Solutions**:

1. **Check if service is running**
   ```bash
   bash manage-service.sh status
   ```

2. **Verify database exists**
   ```bash
   ls -la data/jobs.db
   ```

3. **Trigger search**
   ```bash
   curl -X POST http://localhost:9090/api/search/now
   ```

4. **Check API directly**
   ```bash
   curl http://localhost:9090/api/jobs
   curl http://localhost:9090/api/stats
   ```

5. **Check browser console**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for JavaScript errors

---

### "Resume matching not working"

**Symptoms**:
- Upload resume works
- But match scores show 0% for all jobs

**Solutions**:

1. **Verify resume uploaded**
   ```bash
   ls -la data/resume.txt
   ```

2. **Resume format**
   - Paste plain text only
   - Should include relevant keywords matching your field (technical skills, domain expertise, etc.)

3. **Re-upload resume**
   - Dashboard → Upload & Analyze Resume
   - Paste full resume text
   - Wait for "Resume analyzed" message

4. **Check logs for parsing errors**
   ```bash
   bash manage-service.sh logs | grep -i resume
   ```

---

## Getting Help

1. **Check existing issues**: https://github.com/generallymatthew/search-party/issues
2. **Search this guide** for similar problems
3. **Open new issue** if not found:
   - Include error message/logs
   - Describe what you were doing
   - Include environment (OS, Node version)
4. **Join discussions**: https://github.com/generallymatthew/search-party/discussions

---

## Debug Mode

For detailed logging:

```bash
# Set debug environment
DEBUG=* npm run dev

# Or in .env
DEBUG=search-party:*
```

This will output detailed logs to help diagnose issues.

---

**Still stuck?** Open an issue or discussion on GitHub! 🙏
