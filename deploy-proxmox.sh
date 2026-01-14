#!/bin/bash
#
# Call4Me Proxmox LXC Deployment Script
#
# This script automates the deployment of Call4Me to a Proxmox LXC container.
# Run this script on a Proxmox VE node as root.
#
# Usage: ./deploy-proxmox.sh [OPTIONS]
#
# Options:
#   --non-interactive  Skip interactive prompts (use defaults or provided values)
#   --ctid <id>        Container ID (default: auto-detect next available)
#   --hostname <name>  Container hostname (default: call4me)
#   --storage <pool>   Storage pool for container (default: auto-detect)
#   --bridge <name>    Network bridge (default: vmbr0)
#   --memory <mb>      Memory in MB (default: 512)
#   --cores <n>        CPU cores (default: 1)
#   --disk <size>      Disk size (default: 8)
#   --help             Show this help message
#

set -euo pipefail

# =============================================================================
# Configuration (can be overridden via command line or interactive prompts)
# =============================================================================
CTID=""
HOSTNAME="call4me"
MEMORY=512
CORES=1
DISK_SIZE=8
STORAGE=""
BRIDGE="vmbr0"
REPO_URL="https://github.com/Faileb/Call4Me.git"
TEMPLATE="debian-12-standard"
APP_DIR="/opt/call4me"
INTERACTIVE=true

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

die() {
    log_error "$1"
    exit 1
}

show_help() {
    head -30 "$0" | tail -18
    exit 0
}

# =============================================================================
# Interactive Selection Functions
# =============================================================================

# Display a menu and get user selection
# Usage: select_option "prompt" "option1" "option2" ...
# Returns: selected option via echo
select_option() {
    local prompt="$1"
    shift
    local options=("$@")
    local count=${#options[@]}

    echo ""
    echo -e "${CYAN}${BOLD}$prompt${NC}"
    echo ""

    for i in "${!options[@]}"; do
        echo -e "  ${BOLD}$((i+1)))${NC} ${options[$i]}"
    done

    echo ""
    while true; do
        read -rp "Enter selection [1-$count]: " selection
        if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "$count" ]; then
            echo "${options[$((selection-1))]}"
            return
        fi
        echo -e "${RED}Invalid selection. Please enter a number between 1 and $count.${NC}"
    done
}

# Get user input with a default value
# Usage: get_input "prompt" "default"
get_input() {
    local prompt="$1"
    local default="$2"
    local input

    read -rp "$prompt [$default]: " input
    echo "${input:-$default}"
}

# =============================================================================
# Parse Command Line Arguments
# =============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --non-interactive)
                INTERACTIVE=false
                shift
                ;;
            --ctid)
                CTID="$2"
                shift 2
                ;;
            --hostname)
                HOSTNAME="$2"
                shift 2
                ;;
            --storage)
                STORAGE="$2"
                shift 2
                ;;
            --bridge)
                BRIDGE="$2"
                shift 2
                ;;
            --memory)
                MEMORY="$2"
                shift 2
                ;;
            --cores)
                CORES="$2"
                shift 2
                ;;
            --disk)
                DISK_SIZE="$2"
                shift 2
                ;;
            --help|-h)
                show_help
                ;;
            *)
                die "Unknown option: $1. Use --help for usage information."
                ;;
        esac
    done
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

check_root() {
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root"
    fi
}

check_proxmox() {
    log_info "Checking Proxmox environment..."

    if ! command -v pveversion &> /dev/null; then
        die "This script must be run on a Proxmox VE node (pveversion not found)"
    fi

    if ! command -v pct &> /dev/null; then
        die "pct command not found. Is this a Proxmox VE node?"
    fi

    if ! command -v pvesm &> /dev/null; then
        die "pvesm command not found. Is this a Proxmox VE node?"
    fi

    local pve_version
    pve_version=$(pveversion --verbose | head -1)
    log_success "Running on: $pve_version"
}

get_next_ctid() {
    if [[ -n "$CTID" ]]; then
        # Validate provided CTID
        if pct status "$CTID" &> /dev/null; then
            die "Container $CTID already exists"
        fi
        return
    fi

    log_info "Finding next available container ID..."
    CTID=$(pvesh get /cluster/nextid)
    log_success "Using container ID: $CTID"
}

# =============================================================================
# Interactive Configuration
# =============================================================================

get_available_storages() {
    # Get storage pools that support container rootdir (rootdir content type)
    pvesm status --content rootdir 2>/dev/null | tail -n +2 | awk '{print $1}' || \
    pvesm status 2>/dev/null | tail -n +2 | awk '{print $1}'
}

get_available_bridges() {
    # Get network bridges from /etc/network/interfaces
    grep -E "^iface vmbr[0-9]+" /etc/network/interfaces 2>/dev/null | awk '{print $2}' || echo "vmbr0"
}

interactive_setup() {
    if [[ "$INTERACTIVE" != "true" ]]; then
        return
    fi

    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}                    Call4Me LXC Container Configuration                    ${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"

    # Storage selection
    if [[ -z "$STORAGE" ]]; then
        local storages
        mapfile -t storages < <(get_available_storages)

        if [[ ${#storages[@]} -eq 0 ]]; then
            die "No storage pools found that support containers"
        elif [[ ${#storages[@]} -eq 1 ]]; then
            STORAGE="${storages[0]}"
            log_info "Using only available storage: $STORAGE"
        else
            echo ""
            echo -e "${CYAN}${BOLD}Select storage pool for container:${NC}"
            echo ""

            # Show storage details
            echo -e "  ${BOLD}Available storage pools:${NC}"
            pvesm status --content rootdir 2>/dev/null || pvesm status
            echo ""

            for i in "${!storages[@]}"; do
                echo -e "  ${BOLD}$((i+1)))${NC} ${storages[$i]}"
            done

            echo ""
            while true; do
                read -rp "Enter selection [1-${#storages[@]}]: " selection
                if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#storages[@]}" ]; then
                    STORAGE="${storages[$((selection-1))]}"
                    break
                fi
                echo -e "${RED}Invalid selection.${NC}"
            done
        fi
    fi

    # Network bridge selection
    local bridges
    mapfile -t bridges < <(get_available_bridges)

    if [[ ${#bridges[@]} -gt 1 ]] && [[ "$INTERACTIVE" == "true" ]]; then
        echo ""
        echo -e "${CYAN}${BOLD}Select network bridge:${NC}"
        echo ""
        for i in "${!bridges[@]}"; do
            echo -e "  ${BOLD}$((i+1)))${NC} ${bridges[$i]}"
        done
        echo ""
        while true; do
            read -rp "Enter selection [1-${#bridges[@]}] (default: 1): " selection
            selection="${selection:-1}"
            if [[ "$selection" =~ ^[0-9]+$ ]] && [ "$selection" -ge 1 ] && [ "$selection" -le "${#bridges[@]}" ]; then
                BRIDGE="${bridges[$((selection-1))]}"
                break
            fi
            echo -e "${RED}Invalid selection.${NC}"
        done
    fi

    # Container settings
    echo ""
    echo -e "${CYAN}${BOLD}Container Settings:${NC}"
    echo ""

    HOSTNAME=$(get_input "  Hostname" "$HOSTNAME")
    MEMORY=$(get_input "  Memory (MB)" "$MEMORY")
    CORES=$(get_input "  CPU Cores" "$CORES")
    DISK_SIZE=$(get_input "  Disk Size (GB)" "$DISK_SIZE")

    # Confirmation
    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}                         Configuration Summary                             ${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Container ID:   ${BOLD}$CTID${NC}"
    echo -e "  Hostname:       ${BOLD}$HOSTNAME${NC}"
    echo -e "  Storage:        ${BOLD}$STORAGE${NC}"
    echo -e "  Network Bridge: ${BOLD}$BRIDGE${NC}"
    echo -e "  Memory:         ${BOLD}${MEMORY}MB${NC}"
    echo -e "  CPU Cores:      ${BOLD}$CORES${NC}"
    echo -e "  Disk Size:      ${BOLD}${DISK_SIZE}GB${NC}"
    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════════════════${NC}"
    echo ""

    read -rp "Proceed with installation? [Y/n]: " confirm
    if [[ "${confirm,,}" == "n" ]]; then
        echo "Installation cancelled."
        exit 0
    fi
}

check_storage() {
    if [[ -z "$STORAGE" ]]; then
        # Auto-detect first available storage
        STORAGE=$(get_available_storages | head -1)
        if [[ -z "$STORAGE" ]]; then
            die "No storage pools found. Please specify with --storage"
        fi
        log_info "Auto-detected storage pool: $STORAGE"
    fi

    log_info "Checking storage pool '$STORAGE'..."

    if ! pvesm status | grep -q "^$STORAGE"; then
        echo ""
        log_error "Storage pool '$STORAGE' not found."
        echo ""
        echo "Available storage pools:"
        pvesm status
        echo ""
        die "Please run the script again and select a valid storage pool."
    fi

    log_success "Storage pool '$STORAGE' is available"
}

# =============================================================================
# Template Management
# =============================================================================

download_template() {
    log_info "Checking for Debian 12 template..."

    local template_storage="local"
    local template_file

    # Check if template already exists
    template_file=$(pveam list "$template_storage" 2>/dev/null | grep -i "debian-12" | head -1 | awk '{print $1}' || true)

    if [[ -n "$template_file" ]]; then
        log_success "Template found: $template_file"
        TEMPLATE="$template_file"
        return
    fi

    log_info "Downloading Debian 12 template..."
    pveam update

    # Find the exact template name
    local available_template
    available_template=$(pveam available | grep -i "debian-12-standard" | head -1 | awk '{print $2}')

    if [[ -z "$available_template" ]]; then
        die "Could not find Debian 12 template. Available templates:"
        pveam available | grep -i debian
    fi

    pveam download "$template_storage" "$available_template"
    TEMPLATE="${template_storage}:vztmpl/${available_template}"
    log_success "Template downloaded: $TEMPLATE"
}

# =============================================================================
# Container Creation
# =============================================================================

create_container() {
    log_info "Creating LXC container..."

    pct create "$CTID" "$TEMPLATE" \
        --hostname "$HOSTNAME" \
        --memory "$MEMORY" \
        --cores "$CORES" \
        --rootfs "${STORAGE}:${DISK_SIZE}" \
        --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
        --unprivileged 1 \
        --features "nesting=1" \
        --onboot 1 \
        --start 0

    log_success "Container $CTID created"
}

resize_disk_if_needed() {
    # Some storage types need explicit resize after creation
    local current_size
    current_size=$(pct config "$CTID" | grep "^rootfs:" | grep -oP 'size=\K[0-9]+' || echo "0")

    if [[ "$current_size" -lt "$DISK_SIZE" ]]; then
        log_info "Resizing disk to ${DISK_SIZE}G..."
        pct resize "$CTID" rootfs "${DISK_SIZE}G" 2>/dev/null || true
    fi
}

start_container() {
    log_info "Starting container..."
    pct start "$CTID"

    # Wait for container to be fully up
    log_info "Waiting for container to initialize..."
    sleep 5

    # Wait for network
    local attempts=0
    while ! pct exec "$CTID" -- ping -c 1 -W 2 8.8.8.8 &> /dev/null; do
        attempts=$((attempts + 1))
        if [[ $attempts -gt 30 ]]; then
            die "Container failed to get network connectivity"
        fi
        sleep 2
    done

    log_success "Container is running with network access"
}

# =============================================================================
# In-Container Setup
# =============================================================================

exec_in_container() {
    pct exec "$CTID" -- bash -c "$1"
}

install_base_packages() {
    log_info "Updating package lists and installing base packages..."

    exec_in_container "apt-get update && apt-get upgrade -y"
    exec_in_container "apt-get install -y curl git build-essential ffmpeg ca-certificates gnupg"

    log_success "Base packages installed"
}

install_nodejs() {
    log_info "Installing Node.js 20..."

    exec_in_container "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
    exec_in_container "apt-get install -y nodejs"

    local node_version
    node_version=$(exec_in_container "node --version")
    log_success "Node.js installed: $node_version"
}

create_app_user() {
    log_info "Creating application user..."

    exec_in_container "useradd --system --create-home --home-dir $APP_DIR --shell /bin/bash call4me || true"

    log_success "User 'call4me' created"
}

clone_repository() {
    log_info "Cloning Call4Me repository..."

    exec_in_container "rm -rf $APP_DIR/app && git clone $REPO_URL $APP_DIR/app"
    exec_in_container "chown -R call4me:call4me $APP_DIR"

    log_success "Repository cloned to $APP_DIR/app"
}

install_app_dependencies() {
    log_info "Installing application dependencies (this may take a few minutes)..."

    exec_in_container "su call4me -c 'cd $APP_DIR/app && npm install'"
    exec_in_container "su call4me -c 'cd $APP_DIR/app/web && npm install'"

    log_success "Dependencies installed"
}

build_application() {
    log_info "Building application..."

    exec_in_container "su call4me -c 'cd $APP_DIR/app && npx prisma generate'"
    exec_in_container "su call4me -c 'cd $APP_DIR/app && npm run build'"

    log_success "Application built successfully"
}

create_data_directory() {
    log_info "Creating data directory..."

    exec_in_container "mkdir -p $APP_DIR/app/data/recordings"
    exec_in_container "chown -R call4me:call4me $APP_DIR/app/data"

    log_success "Data directory created"
}

# =============================================================================
# Service Configuration
# =============================================================================

create_env_file() {
    log_info "Creating environment configuration file..."

    # Generate a secure random secret
    local app_secret
    app_secret=$(openssl rand -hex 32)

    exec_in_container "cat > $APP_DIR/app/.env << 'ENVEOF'
# Call4Me Configuration
# Most settings are configured via the web-based setup wizard.
# This file contains runtime environment settings only.

# =============================================================================
# Runtime Configuration
# =============================================================================
NODE_ENV=production
APP_PORT=3000
LOG_LEVEL=info

# Secret key for session encryption (auto-generated, do not change)
APP_SECRET=$app_secret

# Database location
DATABASE_URL=file:./prisma/data/call4me.db

# Timezone for scheduled calls (e.g., America/New_York, Europe/London)
TZ=UTC
ENVEOF"

    exec_in_container "chown call4me:call4me $APP_DIR/app/.env"
    exec_in_container "chmod 600 $APP_DIR/app/.env"

    log_success "Environment file created at $APP_DIR/app/.env"
}

create_systemd_service() {
    log_info "Creating systemd service..."

    exec_in_container "cat > /etc/systemd/system/call4me.service << 'SERVICEEOF'
[Unit]
Description=Call4Me - Automated Phone Call Service
Documentation=https://github.com/Faileb/Call4Me
After=network.target

[Service]
Type=simple
User=call4me
Group=call4me
WorkingDirectory=/opt/call4me/app
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=10

# Environment
EnvironmentFile=/opt/call4me/app/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/call4me/app/data
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=call4me

[Install]
WantedBy=multi-user.target
SERVICEEOF"

    exec_in_container "systemctl daemon-reload"
    exec_in_container "systemctl enable call4me"

    log_success "Systemd service created and enabled"
}

initialize_database() {
    log_info "Initializing database..."

    # Create a minimal .env for database initialization
    exec_in_container "su call4me -c 'cd $APP_DIR/app && npx prisma db push'"

    log_success "Database initialized"
}

# =============================================================================
# Summary
# =============================================================================

get_container_ip() {
    local ip
    ip=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
    echo "$ip"
}

show_summary() {
    local container_ip
    container_ip=$(get_container_ip)

    echo ""
    echo "============================================================================="
    echo -e "${GREEN}Call4Me deployment complete!${NC}"
    echo "============================================================================="
    echo ""
    echo "Container Details:"
    echo "  - Container ID:  $CTID"
    echo "  - Hostname:      $HOSTNAME"
    echo "  - IP Address:    $container_ip"
    echo "  - Storage:       $STORAGE"
    echo "  - Memory:        ${MEMORY}MB"
    echo "  - CPU Cores:     $CORES"
    echo "  - Disk Size:     ${DISK_SIZE}GB"
    echo ""
    echo "Application Details:"
    echo "  - Install Path:  $APP_DIR/app"
    echo "  - Config File:   $APP_DIR/app/.env"
    echo "  - Data Path:     $APP_DIR/app/data"
    echo ""
    echo "============================================================================="
    echo -e "${YELLOW}NEXT STEPS:${NC}"
    echo "============================================================================="
    echo ""
    echo "1. Access the setup wizard:"
    echo "   http://$container_ip:3000"
    echo ""
    echo "   The wizard will guide you through:"
    echo "   - Setting up a login password"
    echo "   - Configuring Twilio credentials"
    echo "   - Setting up a public URL (ngrok/Tailscale/Cloudflare)"
    echo ""
    echo "2. Check service status:"
    echo "   pct exec $CTID -- systemctl status call4me"
    echo ""
    echo "3. View logs:"
    echo "   pct exec $CTID -- journalctl -u call4me -f"
    echo ""
    echo "============================================================================="
    echo -e "${BLUE}NOTES:${NC}"
    echo "============================================================================="
    echo ""
    echo "- For Twilio webhooks and microphone access, use HTTPS."
    echo "  The setup wizard can configure ngrok for you automatically."
    echo ""
    echo "- To enter the container shell:"
    echo "   pct enter $CTID"
    echo ""
    echo "============================================================================="
}

# =============================================================================
# Cleanup on Error
# =============================================================================

# Track whether we created a container (to know if cleanup is needed)
CONTAINER_CREATED=false

cleanup_on_error() {
    local exit_code=$?

    # Disable the trap to prevent recursive calls
    trap - ERR EXIT INT TERM

    # Only clean up if we actually created a container
    if [[ "$CONTAINER_CREATED" == "true" ]] && [[ -n "${CTID:-}" ]]; then
        echo ""
        log_warn "Installation failed. Cleaning up container $CTID..."

        # Stop the container if running
        if pct status "$CTID" 2>/dev/null | grep -q "running"; then
            log_info "Stopping container..."
            pct stop "$CTID" 2>/dev/null || true
            sleep 2
        fi

        # Destroy the container
        log_info "Removing container..."
        pct destroy "$CTID" 2>/dev/null || true

        if ! pct status "$CTID" &>/dev/null; then
            log_success "Container $CTID cleaned up successfully"
        else
            log_error "Failed to clean up container $CTID. Please remove manually: pct destroy $CTID"
        fi
    fi

    exit "${exit_code:-1}"
}

# Mark container as created (call this after pct create succeeds)
mark_container_created() {
    CONTAINER_CREATED=true
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo "============================================================================="
    echo "  Call4Me Proxmox LXC Deployment Script"
    echo "============================================================================="
    echo ""

    parse_args "$@"

    # Set up error handling for ERR, INT (Ctrl+C), and TERM signals
    trap cleanup_on_error ERR INT TERM

    # Pre-flight checks
    check_root
    check_proxmox
    get_next_ctid

    # Interactive configuration (if enabled)
    interactive_setup

    # Validate storage after interactive setup
    check_storage

    # Container setup
    download_template
    create_container
    mark_container_created  # From this point, cleanup will remove the container on failure
    resize_disk_if_needed
    start_container

    # In-container installation
    install_base_packages
    install_nodejs
    create_app_user
    clone_repository
    install_app_dependencies
    create_data_directory
    create_env_file
    build_application
    initialize_database
    create_systemd_service

    # Clear the trap on success (don't clean up a successfully created container)
    trap - ERR INT TERM

    # Done
    show_summary
}

main "$@"
