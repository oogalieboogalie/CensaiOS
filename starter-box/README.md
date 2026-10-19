# censaiOS Starter Box

Turn a spare computer into a box that is ready to vibecode: Claude Code, Codex, free local AI (Ollama), Docker, Git, and censaiOS, all set up in one go.

## What you need

- A computer with **Ubuntu 24.04** (or 22.04, or Debian 12) freshly installed. An old ThinkPad or a small mini PC is perfect.
- **8 GB of memory or more** and about **40 GB of free space**.
- The internet, plugged into **your router** (or Wi-Fi).

**Plug the box into your router, never in between your computer and the router.** Router to box, router to your computer. If your computer's internet cable runs through the box, every website you open has to squeeze through it and everything gets slow.

## Set it up (one command)

Open a terminal on the box and type:

```bash
git clone https://github.com/oogalieboogalie/CensaiOS.git ~/censaios-kit
sudo bash ~/censaios-kit/starter-box/setup.sh
```

The first time takes about 20 to 40 minutes, mostly downloading and building censaiOS. You can run it again at any time; it skips everything that is already done.

When it finishes, sign out and back in once.

## Use it

On the box, open **http://localhost:3002** in the browser. That is censaiOS.

In a terminal, type `claude` (or `codex`) and sign in with your own account. Then just ask: "make me a website for my bakery".

No account at all? `ollama run llama3.2:3b` gives you a free AI that runs on the box itself (smaller and slower than the paid ones).

## The `starter-box` command

| Type this | What it does |
|---|---|
| `starter-box` | Shows the address to open and these commands |
| `starter-box doctor` | Checks everything is installed and healthy, and says how to fix anything that is not |
| `starter-box keys` | Opens your private keys file, for anyone who uses API keys instead of signing in |
| `starter-box remote` | Turns on Tailscale so you can reach the box from anywhere, with no router setup |
| `starter-box update` | Gets the newest censaiOS, Claude Code, Codex and Ollama |
| `starter-box open` | Opens censaiOS in the browser |

## From another computer

The box can be named on your home network, so from any computer on the same Wi-Fi:

```bash
ssh yourname@boxname.local
```

To use censaiOS from that other computer, sign in like this instead, then open http://localhost:3002 on the computer you are using:

```bash
ssh -L 3002:localhost:3002 yourname@boxname.local
```

## Your keys stay yours

The box never sends your AI keys anywhere except to the AI company you picked. They live in one file only you can read: `~/.config/starter-box/keys.env`. Iowa AI never sees them.

## What gets installed

Ubuntu packages (Git, curl, Python), Node.js 22, Docker, Claude Code, Codex, Ollama, censaiOS (starts by itself on every boot), SSH, Tailscale (off until you turn it on), a firewall that blocks everything coming in except SSH and censaiOS "Open anywhere", and Firefox if the box has a desktop.

Leave parts out with `--skip`, for example: `sudo bash setup.sh --skip ollama,remote`. See every part with `--list`.

## Settings

Put these in front of the command, for example `sudo STARTER_BOX_HOSTNAME=censai-box bash setup.sh`:

| Setting | What it does |
|---|---|
| `STARTER_BOX_HOSTNAME` | Renames the box (then reach it at `censai-box.local`) |
| `STARTER_BOX_MODEL` | Downloads a free Ollama model during setup, for example `llama3.2:3b` |
| `STARTER_BOX_USER` | Who the box is for, when you are not running it with `sudo` from that account |
| `STARTER_BOX_UPGRADE=1` | Re-installs the AI tools at their newest versions |

## Testing the kit (for the crew)

```bash
bash starter-box/test/run-in-docker.sh       # fresh Ubuntu, runs setup twice
bash starter-box/test/run-with-systemd.sh    # Ubuntu with real services, also builds censaiOS
```
