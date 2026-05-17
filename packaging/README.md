# Packaging

Templates for running `@clawnify/agent-control-ui` as a long-running local
service.

## systemd (Linux VPS, Raspberry Pi, etc.)

```bash
sudo cp systemd/agent-control-ui.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agent-control-ui.service
```

Pair it with the OpenClaw gateway service so both come up on boot:

```bash
sudo systemctl enable --now openclaw-gateway agent-control-ui
```

Edit `agent-control-ui.service` to set `User=`, `Group=`, and `ExecStart=`
to match your host (default assumes the `openclaw` user from a typical
OpenClaw install).

## launchd (macOS / Mac mini)

```bash
cp launchd/com.clawnify.agent-control-ui.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.clawnify.agent-control-ui.plist
```

The path to `npx` differs by Mac CPU:

- Apple silicon: `/opt/homebrew/bin/npx`
- Intel: `/usr/local/bin/npx`

Logs go to `/tmp/agent-control-ui.{out,err}.log`.
