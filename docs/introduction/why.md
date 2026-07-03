---
title: "🤔 Why it is built this way"
---

# 🤔 Why it is built this way

CryptOS makes some unusual choices on purpose. Each one trades a little convenience for a lot of safety. Here is the thinking behind them, in plain terms.

## 🚫 Why there is no way to log in

Every way *in* to a computer is also a way in for an attacker — a login screen, a shell, a remote desktop. CryptOS removes them all. There is no SSH, no shell, and no user accounts. You cannot log in, and neither can anyone else. The only way to talk to it is one encrypted API, and that door checks your ID every single time.

## 🔑 Why the key lives in a chip

The key CryptOS signs with is its crown jewel. If that key ever leaked, every certificate it made would be suspect. So the key is created *inside* a tamper-resistant chip — the **TPM** — and never leaves it in a form anyone could copy. Even someone holding the hard drive cannot read it.

## 🧱 Why it cannot change while running

If the running system cannot be changed, an attacker cannot quietly slip something in. The files are read-only. And if anything ever did go wrong, a reboot brings the machine back to a known, trusted state.

## 📝 Why everything is one config file

You describe a whole node in a single file — its role, its network, its settings — before it boots. There is no clicking around and no guessing what state a machine is in. You can read the change, review it, and keep it in version control, just like code.

## 🔒 Why one door for everything

Because every action goes through the same encrypted API, every action can be checked against who you are and written into a log that cannot be secretly edited. One door is a door you can actually watch.

---

This is the same idea behind [Talos Linux](https://www.talos.dev), pointed squarely at running a certificate authority.
