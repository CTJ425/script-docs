#!/bin/bash
# Installed to /etc/profile.d/. Launches the first-boot wizard on the first
# interactive local root login, then never again.
#
# Guards, in order:
#   BASH_VERSION  - only for bash logins
#   SSH_TTY unset - console/local logins only, not SSH
#   uid 0         - root only
#   -t 0          - stdin is a real terminal. Without this, Ansible, SFTP/SCP
#                   and other non-interactive root sessions would hang forever
#                   on the wizard's first 'read'.
#   flag file     - the wizard has not completed yet
#   -x on target  - the wizard is actually installed and executable, so a
#                   partial seal cannot make every root login print an error

if [ -n "$BASH_VERSION" ] && [ -z "$SSH_TTY" ] && [ "$(id -u)" -eq 0 ] && [ -t 0 ]; then
    if [ ! -f /etc/firstboot_completed ] && [ -x /usr/local/bin/initial-setup.sh ]; then
        /usr/local/bin/initial-setup.sh
    fi
fi
