#!/bin/bash

# Common logging utility for bash scripts
# Source this file in your scripts: source "$(dirname "$0")/logging.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Symbols
CHECKMARK="${GREEN}\033[1m✓\033[0m${NC}"
CROSS="${RED}\033[1m✗\033[0m${NC}"
WARNING="${YELLOW}\033[1m⚠\033[0m${NC}"
INFO="${BLUE}\033[1mℹ\033[0m${NC}"

# Logging functions
log_error() {
    printf "${RED}ERROR: %s${NC}\n" "$1" >&2
}

log_warning() {
    printf "${YELLOW}WARNING: %s${NC}\n" "$1"
}

log_success() {
    printf "${CHECKMARK} %s\n" "$1"
}

log_info() {
    printf "${INFO} %s\n" "$1"
}

log_step() {
    printf "%s\n" "$1"
}

# Helper functions for common patterns
log_error_exit() {
    log_error "$1"
    exit "${2:-1}"
}

log_command() {
    local cmd="$1"
    local description="$2"
    
    if [ -n "$description" ]; then
        printf "%s\n" "$description"
    fi
    
    if $cmd; then
        if [ -n "$description" ]; then
            log_success "$description completed"
        fi
        return 0
    else
        if [ -n "$description" ]; then
            log_error "$description failed"
        fi
        return 1
    fi
}