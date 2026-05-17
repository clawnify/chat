# Packaging

Templates for running `@clawnify/chat` as a long-running local service.

## systemd (Linux VPS, Raspberry Pi, etc.)

```bash
sudo cp clawnify-chat.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now clawnify-chat.service
```

Pair it with the OpenClaw gateway service so both come up on boot:

```bash
sudo systemctl enable --now openclaw-gateway clawnify-chat
```

Edit `clawnify-chat.service` to set `User=`, `Group=`, and `ExecStart=` to
match your host (default assumes the `openclaw` user from a typical OpenClaw
install).

## launchd (macOS / Mac mini)

```bash
cp launchd/com.clawnify.chat.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.clawnify.chat.plist
```

The path to `npx` differs by Mac CPU:

- Apple silicon: `/opt/homebrew/bin/npx`
- Intel: `/usr/local/bin/npx`

Logs go to `/tmp/clawnify-chat.{out,err}.log`.
