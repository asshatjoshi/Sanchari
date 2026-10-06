# The Sanchari story

This is the plain-English story of what we're building, what we've done so far, and **why** we made each choice. Each part starts simple. The **Why** notes underneath have the real reasons, for when you (or Claude, in a future chat) need them.

Keep adding to it as the project grows. The log at the bottom says what happened when.

---

## What is Sanchari?

Some people find it hard to walk around a big mall. Sanchari puts wheelchairs in the mall that anyone can borrow by themselves, like borrowing a bicycle from a stand.

You walk up to a wheelchair, point your phone at the square barcode stuck on it (a **QR code**), type your name and phone number, and the wheelchair unlocks. When you're done, you press a button on your phone and it locks again.

If someone tries to take the wheelchair out of the mall, it notices and locks itself.

**Why start this simple?** You asked for the simplest version first: scan, type name and number, unlock. Things like sending a secret code to your phone (OTP) and taking payments come later. Getting the basic loop working first lets you test the idea with real people sooner.

---

## The pieces (who does what)

Think of it like a small team where each member has one job.

| Piece | Like a… | What it does |
|---|---|---|
| **The chair's brain** (ESP32) | a tiny computer hidden on the wheelchair | Listens for "open" and "close" orders, and keeps checking where the chair is. |
| **The lock** (solenoid) | a little metal bolt that a magnet pulls back | When electricity flows, the bolt pulls in and the chair is free. No electricity, bolt pops out, chair is locked. |
| **The location finder** (NEO-7M GPS) | the same thing that tells your phone's map where you are | Tells the chair's brain where it is, using satellites. |
| **The server** | the boss in the office | Remembers every chair and every ride, and decides who's allowed to unlock what. |
| **The messenger** (MQTT broker) | a post office | Carries short messages between the boss and the chairs. |
| **The rider page** | the form you fill in | The web page your phone opens after scanning the QR code. |
| **The staff page** | the boss's control screen | Shows every chair: is it online, locked, where is it, who's using it, how much battery. Staff can lock or unlock chairs from here. |
| **The pretend chair** (simulator) | a toy that acts like a real chair | Lets us test everything on the laptop without real hardware. |

**Why a "post office" in the middle?** The chair doesn't wait for someone to call it. It calls the post office as soon as it switches on and keeps the line open. That means the chair works on almost any internet connection, even one that blocks incoming calls, like most mall Wi-Fi. The proper name for this is MQTT, and it's what most internet-connected gadgets use.

**Why does the phone never talk to the chair directly?** The phone and the chair are usually on different networks (your phone on mobile data, the chair on the mall's Wi-Fi). They can't find each other. Both of them can find the server on the internet, so everything goes through the server.

---

## What happens when you unlock a chair

1. You scan the QR code. It opens a web page for that exact chair, like `/w/SAN-0001`. (`SAN-0001` is the chair's name tag.)
2. You type your name and phone number and press **Unlock**.
3. The server checks: does this chair exist? Is anyone else using it? Is it switched on and connected?
4. The server writes down "this person is borrowing this chair" and sends the chair a message: **open**.
5. The chair opens its lock and sends back a message: **done, I'm open**.
6. Only when that reply arrives does your phone say **Unlocked**. If no reply comes within 5 seconds, your phone says "Couldn't unlock, try again", and the chair is freed for the next person.

Ending the ride works the same way, but with **close**.

**Why wait for the chair to reply?** Without the reply, the server would only *hope* the chair opened. If the chair was out of battery or had lost Wi-Fi, the rider would be stuck pulling at a locked chair while the system thought they were riding. Waiting for "done" means the screen always tells the truth.

**Why can't a rider end the ride if the chair doesn't reply?** Then we wouldn't know whether the chair is really locked. The rider is asked to try again. Staff have a "force end" button for emergencies. When they use it, the chair is marked **maintenance**, so nobody else borrows a chair that might not lock.

**What if the chair restarts in the middle of a ride?** A chair always wakes up locked, because that's the safe default. When it wakes up it tells the server "I just woke up". If someone was riding it, the server tells it to open again straight away.

---

## The invisible fence (geofence)

We draw a line around the mall on a map. That's the **geofence**. The chair keeps checking: am I inside the line or outside?

- If it goes **outside**, it beeps, tells the server, and locks.
- If it comes back **inside** during a ride, it unlocks again and stops beeping.

Staff draw the fence on a free website (geojson.io) and paste it into the staff page.

**Why does the chair decide this itself, not the server?** If the chair is outside the mall, it might also have lost its internet connection. If it had to ask the server first, it might never get an answer. Deciding on its own means the fence always works.

**Why wait for 3 readings in a row?** GPS is a bit wobbly. Near the door, the chair's position might jump in and out of the line for no reason. Waiting for three "outside" readings in a row (about 15 seconds) stops false alarms.

**Why ignore readings when the GPS isn't sure?** Inside a mall, the roof blocks the satellites, so the GPS mostly can't tell where it is. We decided: **if the GPS isn't sure, do nothing.** That's fine, because the fence only matters once the chair is outside, where the sky is visible and the GPS works again.

---

## Things we haven't decided yet (important!)

These are written down in `docs/hardware.md` too. Claude should ask about them before changing how the lock or fence behaves.

1. **Locking a chair with someone sitting in it.** You asked for the chair to lock when it leaves the fence, and that's how it works now. But if the lock grabs a wheel, a person who can't walk could be stuck in a car park. Safer options are only beeping and alerting staff, or only locking once the chair stops moving. One switch in the code controls this (`GEOFENCE_AUTO_LOCK` in `firmware/include/config.h`). It also depends on what the lock physically holds: a wheel, or the chair to a stand.
2. **Battery.** This kind of lock uses electricity the whole time it's *open*, so a long ride drains the battery. That's fine for testing. For real chairs, a "latching" lock only uses power while switching.
3. **Internet at the mall.** Mall Wi-Fi usually has a login page that the chair can't get past. For testing, use your own router or a phone hotspot. Later the chair could have its own 4G SIM card.
4. **Anyone who knows a chair's name can unlock it.** That's acceptable for a supervised trial. The OTP (secret code to your phone) will fix this later. For now, one phone number can start at most 5 rides in 10 minutes.

---

## Keeping people's details safe

- Riders' phone numbers are only shown on the staff page, which needs a password (the admin token).
- After you unlock, your phone gets a long random **ride ticket** (a ride ID). Only that phone has it, and it's what lets you end your ride. Nobody can guess someone else's ticket.
- Passwords (Wi-Fi password, admin token, ngrok token) are kept in files that are **never uploaded to GitHub** (`server/.env`, `firmware/include/secrets.h`).

---

## How it looks

- **Brand colour:** a strong blue, `#003fcc`.
- **Logo font:** Baloo 2, which is round and friendly.
- **Reading font:** Atkinson Hyperlegible. It was designed so that people with poor eyesight can read it easily, which suits a wheelchair service.
- **Background:** white, with cards in a very light blue so they stand out.
- We turned off "dark mode" so every phone sees the same white-and-blue look.

---

## How we test

- **On the laptop:** the pretend chair (`npm run sim`) behaves exactly like a real one. You can type `out` to pretend it left the mall, or `mute` to pretend it stopped answering.
- **Automatic checks:** 15 tests check the server and 9 check the fence maths. They run with `npm test` and `pio test -e native`.
- **With your real phone:** we use **ngrok**. It gives the laptop a temporary public web address, so your phone can open the page from anywhere, even on mobile data.

**The phone-testing story:** at first the QR code pointed at the laptop's home-network address. The page opened on the laptop but not on your phone, because the phone couldn't reach the laptop (the laptop's firewall, or a different Wi-Fi). You asked what happens in real life, when the rider's phone isn't on the same network as the chair. The answer: in real life the server lives on the internet (a cloud host), so every phone can reach it. For testing before we pay for a cloud host, ngrok does the same job for free. You picked ngrok, and it worked.

**Why not ngrok forever?** It only works while your laptop is switched on, and test data passes through ngrok's computers. Real chairs need the server on a proper cloud host.

---

## How the code is organised

You don't need this part. It's here for future-Claude.

- `firmware/`: the chair's brain (C++ for the ESP32). The fence maths is kept separate in `lib/geofence/` so it can be tested on the laptop.
- `server/`: the boss (Node.js and TypeScript), plus the rider page and staff page in `server/public/`.
- `docs/protocol.md`: the exact messages the chair and server send each other. The real chair, the server and the pretend chair must all follow it.
- `docs/hardware.md`: shopping list, wiring diagram and bench tests.
- Choices made to keep things simple: SQLite (a database in a single file), no build step (Node runs the TypeScript directly), and plain HTML pages with no framework. All of these can be swapped out later if Sanchari grows.

---

## How we like to work together

- You set up git and GitHub step by step: your name on commits is `akshatjoshi`, and your GitHub account is `asshatjoshi`.
- You'd rather not be asked lots of questions up front. Sensible defaults, explained afterwards, work better.
- You said no to an automatic rule to update `CLAUDE.md` after every change. You'll ask when you want documents updated.
- You asked for this story document so the thinking behind the code isn't lost between chats.

---

## What's next

1. Buy the parts and wire up one chair on the desk (`docs/hardware.md` has the list and the order to test things).
2. Put the real chair's Wi-Fi and post-office details in `firmware/include/secrets.h` and load the code onto it.
3. Decide the open questions above, especially what happens when an occupied chair leaves the fence.
4. Later: OTP codes, payments, a cloud server with a real domain, a 4G chip in the chair, a custom circuit board.

---

## Log

- **2026-10-06.** Set up git and GitHub (with an SSH key, so pushing needs no password). Planned the system. Built the chair code, server, rider page, staff page, pretend chair and docs, and checked everything works together on the laptop. Tested from a real phone, first on home Wi-Fi (blocked) and then through ngrok (worked). Changed the look to the Sanchari blue and fonts. Added ngrok steps to the README and CLAUDE.md. Started this story document.
