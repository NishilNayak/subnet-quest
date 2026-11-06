# Subnet Quest 🌐

**Learn IP addressing and subnetting by playing.**

Subnet Quest is a free, browser-based learning game for anyone studying for the **CompTIA Network+** exam, or anyone who wants to understand computer networking from the ground up. No networking or maths background is needed: it starts from “what is an IP address?” and builds up to solving full subnets in your head.

### ▶️ [Play it here: nishilnayak.github.io/subnet-quest](https://nishilnayak.github.io/subnet-quest/)

---

## Who is this for?

- 🎓 **Network+ candidates** who want lots of hands-on subnetting practice
- 🧑‍💻 **Beginners** learning computer networking for the first time
- 🔁 **Anyone revising** IP classes, CIDR, masks or private address ranges

## Features

### 📚 Lessons (8, from zero)

Each lesson has interactive examples and ends with a quick check question.

| # | Lesson | What you'll learn |
|---|--------|-------------------|
| 1 | What is an IP address, and why do we need one? | Packets, routers, the network part vs the host part |
| 2 | Binary from zero | Light-switch place values, plus a step-by-step decimal → binary converter |
| 3 | IP address classes (A–E) | First-octet ranges, leading bits, default masks |
| 4 | Network bits, host bits, masks & CIDR | Where the line goes, the mask as a stencil, and `/N` notation |
| 5 | What is a subnet, and why use one? | Security, broadcasts, borrowing host bits |
| 6 | Network, broadcast & hosts | Usable host counts with `2^h − 2` |
| 7 | The magic number trick | Block size, a fast mental method for subnetting |
| 8 | Special address ranges | Private, loopback, APIPA, multicast |

There's also a **glossary** of the key networking terms.

### 🎮 Games

| Game | Level | Practise |
|------|-------|----------|
| 🧮 **Binary Blitz** | Warm-up | Decimal → binary. Practice mode with tips, or 60-second timed rounds |
| 🎭 **Mask Match** | Beginner | CIDR ↔ subnet masks, host counts, sizing a subnet |
| 🏛️ **Class Clash** | Beginner | Classes A–E, default masks, leading bits, the network portion |
| 🕵️ **IP Detective** | Beginner | Private, public, loopback, APIPA or multicast? |
| 🔗 **Same Network?** | Intermediate | Are two hosts on the same subnet? |
| 🧩 **Subnet Solver** | Boss level | Mask, network, broadcast, host range and host count (easy / medium / hard) |

### 🧠 Learn while you play

- A quick refresher before every quiz
- 💡 **Hint** buttons (half XP if you use one)
- A cheat sheet you can open during any quiz
- A clear **“Why”** explanation after every answer, right or wrong
- **Guided mode** in Subnet Solver: a tip under every box, and boxes turn green as soon as they're right

### 🧪 Subnet Lab

Type any IPv4 address, drag the prefix slider, and watch the network and host bits change live. You can also split a network into smaller subnets.

### 🏆 Progress

XP, levels, streaks and 10 badges. Progress is saved **only in your own browser**: there are no accounts and no data is collected.

## Network+ topics covered

These line up with the IP addressing objectives of CompTIA Network+:

- [x] IPv4 address structure and octets
- [x] Binary ↔ decimal conversion
- [x] Classful addressing (A, B, C, D, E)
- [x] Subnet masks and CIDR notation
- [x] Network address, broadcast address and usable host range
- [x] Subnetting and borrowing host bits
- [x] Private (RFC 1918), loopback, APIPA and multicast ranges

> **Note:** Subnet Quest is an independent study aid. It is not affiliated with or endorsed by CompTIA.

## Run it locally

No build step and no dependencies: it's plain HTML, CSS and JavaScript.

```bash
git clone https://github.com/NishilNayak/subnet-quest.git
cd subnet-quest
python3 -m http.server 8000
```

Then open <http://localhost:8000>. You can also just open `index.html` in your browser.

## Project structure

```
subnet-quest/
├── index.html   # Page layout and all views
├── styles.css   # Styling (light and dark mode)
├── app.js       # Lessons, games, IP maths and progress
└── README.md
```

## Contributing

Found a mistake or have an idea for a new game or lesson? Please [open an issue](https://github.com/NishilNayak/subnet-quest/issues) or send a pull request.

## Credits

Made by **Nishil Nayak** ([LinkedIn](https://www.linkedin.com/in/nishil-nayak)) using [Claude](https://claude.ai), Anthropic's AI assistant.
