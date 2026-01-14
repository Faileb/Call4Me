# Call4Me

A self-hosted web application that automates phone calls via the Twilio API. Perfect for leaving scheduled voice messages on answering machines.

## Features

- **Call Scheduling**: Schedule one-time or recurring phone calls with a visual calendar and clock picker
- **Voice Recordings**: Upload audio files or record directly from your browser microphone
- **Answering Machine Detection (AMD)**: Automatically detect voicemail and play your message after the beep
- **Contact Book**: Store frequently called numbers with names and notes
- **Templates**: Save preset call configurations for quick scheduling
- **Call History**: View logs of all calls with status, duration, and retry options
- **Grafana Integration**: Prometheus metrics endpoint for monitoring
- **Single-User Auth**: Simple password protection for your instance

## Screenshots

*Coming soon*

## Quick Start

### Prerequisites

- Node.js 20+
- A Twilio account with a phone number
- Docker (recommended) or Node.js for direct installation

### Docker Installation (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/Call4Me.git
   cd Call4Me
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your configuration:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   APP_SECRET=your-32-char-secret-key-here
   APP_PASSWORD=your_secure_password
   APP_BASE_URL=https://call4me.yourdomain.com
   ```

4. Start with Docker Compose:
   ```bash
   docker-compose up -d
   ```

5. Access the web UI at `http://localhost:3000`

### Manual Installation

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/yourusername/Call4Me.git
   cd Call4Me
   npm install
   cd web && npm install && cd ..
   ```

2. Set up the database:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

3. Build the application:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
   ```

### Development

```bash
# Start both backend and frontend in development mode
npm run dev
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | - | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | - | Your Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Yes | - | Your Twilio phone number (E.164 format) |
| `APP_SECRET` | Yes | - | Secret key for session signing (min 32 chars) |
| `APP_PASSWORD` | Yes | - | Password for web UI login |
| `APP_BASE_URL` | Yes | - | Public URL of your instance (for Twilio webhooks) |
| `DATABASE_URL` | No | `file:./data/call4me.db` | SQLite or PostgreSQL connection string |
| `RECORDINGS_PATH` | No | `./data/recordings` | Directory for audio file storage |
| `APP_PORT` | No | `3000` | Port to listen on |
| `LOG_LEVEL` | No | `info` | Logging level (error, warn, info, debug) |
| `DISABLE_AUTH` | No | `false` | Disable authentication (not recommended) |
| `TZ` | No | UTC | Timezone for scheduling |

### Twilio Setup

1. Create a Twilio account at https://www.twilio.com
2. Buy a phone number with Voice capability
3. Get your Account SID and Auth Token from the Console
4. Ensure your `APP_BASE_URL` is publicly accessible for webhooks

### Reverse Proxy

For production, use a reverse proxy like Caddy or Nginx:

**Caddy:**
```
call4me.yourdomain.com {
    reverse_proxy localhost:3000
}
```

**Nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name call4me.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## LXC Container Deployment

For Proxmox LXC deployment:

1. Create a Debian/Ubuntu LXC container
2. Install Node.js 20:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt-get install -y nodejs
   ```
3. Clone, build, and configure the app
4. Create a systemd service:
   ```ini
   # /etc/systemd/system/call4me.service
   [Unit]
   Description=Call4Me
   After=network.target

   [Service]
   Type=simple
   User=call4me
   WorkingDirectory=/opt/call4me
   ExecStart=/usr/bin/node dist/server.js
   Restart=always
   EnvironmentFile=/opt/call4me/.env

   [Install]
   WantedBy=multi-user.target
   ```
5. Enable and start:
   ```bash
   systemctl enable call4me
   systemctl start call4me
   ```

## Grafana Integration

Call4Me exposes Prometheus metrics at `/metrics`:

- `call4me_calls_total{status}` - Total calls by status
- `call4me_calls_scheduled` - Number of pending scheduled calls
- `call4me_call_duration_seconds` - Call duration histogram
- `call4me_recordings_total` - Number of recordings
- `call4me_last_call_timestamp` - Unix timestamp of last call

Add to your Prometheus config:
```yaml
scrape_configs:
  - job_name: 'call4me'
    static_configs:
      - targets: ['call4me:3000']
```

## API

See the [API documentation](docs/API.md) for details on available endpoints.

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: React, TypeScript, Tailwind CSS
- **Database**: SQLite (default) or PostgreSQL
- **ORM**: Prisma
- **Scheduling**: node-cron
- **Voice**: Twilio API

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
