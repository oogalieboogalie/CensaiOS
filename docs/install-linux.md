# censaiOS on a Linux laptop (ThinkPad, MX Linux, Mint, Ubuntu, Debian)

One command sets up a refurbished ThinkPad (or any 64-bit Intel or AMD computer) with censaiOS.
It is the [Starter Box](../starter-box/README.md) setup, and it works on:

- **MX Linux** 23 or newer, both the **Fluxbox** (lightweight) and **Xfce** editions, with the
  default start-up system (MX does not use systemd unless you pick it at boot; either way works)
- Linux Mint, Ubuntu 22.04 or 24.04, Debian 12 or 13

## The one command

Open a terminal on the laptop (on MX Fluxbox: right-click the desktop, Terminal), paste this, and
press Enter. It asks for your password once.

```bash
sudo apt-get install -y git && git clone -b nightly https://github.com/oogalieboogalie/CensaiOS.git ~/censaios-kit && sudo bash ~/censaios-kit/starter-box/setup.sh --skip ollama
```

What it does: installs Docker, downloads the ready-made censaiOS (about 2 GB, nothing is built on
the laptop), starts it, makes it start by itself every time the laptop turns on, and adds Claude
Code, Codex, SSH and a firewall. It takes about 10 to 20 minutes on home internet. If anything
stops, paste the same command again: it skips what is already done.

When it says **All done**, sign out and back in once (or restart), then open
**http://localhost:3002** in the browser on the laptop.

`--skip ollama` leaves out Ollama, the free AI that runs on the laptop itself. It is a big
download and too slow to be useful on 4 or 8 GB laptops; censaiOS uses the AI keys you add in
the app instead. Drop `--skip ollama` on a computer with 16 GB or more if you want it.

## Stop, start, update

| To | Type this in a terminal |
|---|---|
| Stop censaiOS (frees its memory) | `cd /opt/censaios && docker compose stop` |
| Start it again | `cd /opt/censaios && docker compose start` |
| Get the newest version | `starter-box update` |
| Check everything is healthy | `starter-box doctor` |

censaiOS starts by itself when the laptop turns on, unless you stopped it. Your boards, agents and
keys stay on the laptop through updates and restarts.

## Memory: 4 GB versus 8 GB

On Linux, Docker is not a separate virtual machine, so there is no fixed cap like the one Docker
Desktop puts on Windows (there, WSL takes half the computer's memory by default, which is the
"about 5 GB" you saw). Here censaiOS shares the laptop's memory directly and only uses what it
needs. The setup gives each part a ceiling so one part can never take the whole laptop:

| Part | 8 GB laptop (or more) | 4 GB laptop |
|---|---|---|
| The app | up to 4 GB | up to 2 GB |
| Database | up to 1 GB | up to 512 MB |
| Search memory (Qdrant) | up to 1 GB | up to 512 MB |
| Docker helper | up to 512 MB | up to 256 MB |

These are ceilings, not what it takes all the time: just started and idle, all four parts
together used about 310 MB in testing. Boards, chats and agents add to that as you use them.

- **8 GB:** comfortable. censaiOS, a browser with a few tabs and Claude Code side by side.
- **4 GB:** it runs, but the browser and censaiOS share a small space, so keep the tab count low.
  Putting a stick in the open slot to reach 8 GB is the single best upgrade.

To change a ceiling, edit `/opt/censaios/.env` (for example `CENSAI_APP_MEMORY=3g`) and run
`cd /opt/censaios && docker compose up -d`.

## From another computer

censaiOS answers on the laptop itself. To use it from another computer on the same Wi-Fi, turn on
**Settings > Open anywhere** in censaiOS and follow the steps there (it uses port 3004 and a
one-time code), or see "From another computer" in the [Starter Box guide](../starter-box/README.md).
