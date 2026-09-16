# CM30 MDB Bridge

A React Native bridge to the CM30 terminal's MDB (Multi-Drop Bus) slave port, with a debug app that
demonstrates MDB cashless Levels 1, 2 and 3 end to end - in raw hex and in words.

* **device-lib/** - a small Kotlin library that moves bytes (no protocol inside) plus the Turbo Module that
  exposes it to JavaScript as `connect / disconnect / send` and two event streams.
* **rn-app/** - the debug app: the codec (bytes <-> typed messages), the cashless session (the state machine)
  and the debug screen. Runs on the emulator with a fake vending machine controller, and on the CM30 with the real one.
* **dist/** - the APK, produced by one command (`scripts\build-apk.cmd`).

Toolchain: React Native 0.87 (new architecture, Turbo Modules, Codegen), Kotlin 2.2, Android Gradle Plugin 9.2,
JDK 17, TypeScript 6, Jest 29. Everything builds offline once the caches are warm.

## Build, test, run

| I want to...                                   | Command (from this folder)                       |
|------------------------------------------------|--------------------------------------------------|
| build the CM30's APK (armeabi-v7a, JS bundled) | `scripts\build-apk.cmd` -> `dist\cm30-mdb-bridge-armeabi-v7a-debug.apk` |
| run every test (29 Kotlin + 113 Jest)          | `scripts\test-all.cmd`                            |
| run the app on the emulator with live reload   | `scripts\run-emulator.cmd`                        |
| run the exact standalone APK on the emulator   | `scripts\run-emulator.cmd standalone`             |
| install and watch on the CM30 (USB debugging)  | `scripts\install-cm30.cmd`                        |

The scripts set `JAVA_HOME`, `ANDROID_HOME` and `GRADLE_USER_HOME` from `scripts\env.cmd` (everything lives on `D:\dev`).
The Gradle builds use `--offline`; if one ever says *No cached version ... available for offline mode*, run the
printed command once without `--offline`.

## The layers

```
 rn-app/src/features/debug     Module 7   the debug screen: chips, panels, the labelled frame log
 rn-app/src/device/session     Module 6   CashlessSession - MDB Section 7 as a state machine (Levels 1/2/3)
 rn-app/src/device/codec       Module 5   one table of messages -> decode / encode / describe, checksum included
 device-lib/rn-bridge          Module 4   Turbo Module @rabbah/mdb-device: Promises + onFrame/onState events
 device-lib/transport-mdb      Module 3   MdbSlaveTransport over the CM30 library (libmdbSlave.so): the reflexes
 device-lib/testing            Module 2   FakeTransport - a puppet VMC for the emulator and the Kotlin tests
 device-lib/core               Module 1   Transport, Frame, DeviceError, ConnectionState, hex/checksum helpers
 device-lib/cm30-aar                      CM30-HardwareLibrary-1.0.9.aar, wrapped as a Gradle module
```

**The CM30 library is not in this repository** (it is Ciontek's binary, provided with the task). Copy
`CM30-HardwareLibrary-1.0.9.aar` into `device-lib/cm30-aar/` before building or testing (`transport-mdb` compiles against it).

**The 5 ms rule.** MDB demands an answer within 5 ms of every command; JavaScript cannot promise that. So
Kotlin answers by reflex - ACK for every well-formed block, NAK for a bad checksum, and on POLL either ACK or
the one block waiting in an outbox. JavaScript never answers a command directly: it *queues* a data reply
(`device.send`) and the reply leaves on the next POLL, which MDB/ICP 4.3 (section 7.3) permits. The
Promise resolves with the VMC's answer (`'ack' | 'nak' | 'ret'`) or rejects with a code
(`TIMEOUT`, `DISCONNECTED`, `TRANSPORT_FAILURE`, `INVALID_ARGUMENT`).

**Fake and real are the same contract.** `Transport` (Module 1) is implemented twice: by the puppet
(Module 2, polls itself every 150 ms) and by the real port (Module 3). The bridge holds one of them; nothing
above it can tell which. A third puppet in TypeScript (`src/device/testing/FakeDevice.ts`) plays the same role
under Jest, so the session and the screen are tested without a device.

**Bytes live in one file.** `src/device/codec/table.ts` is the only place with a byte layout. A Jest test
fails the build if a `0x..` literal appears anywhere else in the app.

## The debug screen

| Part                    | Shows / does                                                                                     |
|-------------------------|--------------------------------------------------------------------------------------------------|
| link chip               | `disconnected`, `connecting`, `connected`, `fault DISCONNECTED` (+ the reason underneath)        |
| session chip            | `inactive`, `disabled`, `enabled`, `sessionIdle`, `vend`, `negativeVend`                          |
| fake / real (CM30)      | which transport `Connect` opens                                                                  |
| Session panel           | negotiated level, funds left, sales, cash sales, the VMC's clock, a one-line note; buttons: Begin session 10.00, Deny next vend, Time/date, Cancel session |
| Fake VMC panel          | fake mode only: RESET, SETUP, REQUEST ID, ENABLE, DISABLE, VEND REQUEST 1.00 #5, VEND SUCCESS, VEND FAILURE, SESSION COMPLETE, CASH SALE, NEG VEND 1.00, WRITE TIME, Pull cable |
| raw hex box             | sends any block, checksum included - for experiments on the real bus                           |
| Frames                  | every block, newest first: seq, direction, hex, meaning. *hide POLL* removes the heartbeat       |

### Demo: a Level 1 sale (fake mode)

Connect -> RESET -> SETUP -> ENABLE -> **Begin session 10.00** -> **VEND REQUEST 1.00 #5** -> **VEND SUCCESS** -> **SESSION COMPLETE**

```
VMC -> 10 10                    RESET                       <- 00 00        JUST_RESET
VMC -> 11 00 03 10 02 00 26     SETUP_CONFIG vmcLevel=3     <- 01 03 16 82 01 02 05 03 a7   READER_CONFIG
VMC -> 14 01 15                 READER_ENABLE                                (session: enabled)
   <- 03 03 e8 ff ff ff ff 00 00 00 ea   BEGIN_SESSION_L2 funds=1000        (Level 1 VMC: 03 03 e8 ee)
VMC -> 13 00 00 64 00 05 7c     VEND_REQUEST price=100 item=5   <- 05 00 64 69   VEND_APPROVED amount=100
VMC -> 13 02 00 05 1a           VEND_SUCCESS item=5                          (sales 1)
VMC -> 13 04 17                 SESSION_COMPLETE            <- 07 07        END_SESSION  (session: enabled)
```

Then: **Deny next vend** + VEND REQUEST -> `06 06 VEND_DENIED`. **NEG VEND 1.00** -> approved, funds up.
**WRITE TIME** -> the clock line. **Pull cable** -> `fault DISCONNECTED`, session `inactive`; **Connect** starts over.
Every block above is also a Jest test (`src/device/session/__tests__/level1.test.ts` and friends).

## On the CM30 (hardware day)

1. `scripts\build-apk.cmd`, then `scripts\install-cm30.cmd` with the CM30 on USB (or copy `dist\...apk` and install by hand).
2. Open the app, choose **real (CM30)**, **Connect**. The link chip must say `connected`. If it says
   `fault DISCONNECTED - MDB native library not available`, the APK was built without `armeabi-v7a`.
3. Wire the CM30 to the machine. The log must fill with the VMC's RESET / SETUP / POLL and the session chip must
   walk `inactive -> disabled -> enabled` by itself. Then **Begin session 10.00** and buy something.

Three facts about the CM30 library were assumed and can only be checked on the device
(`device-lib/transport-mdb/.../MdbSlaveTransport.kt`, marked in the code):

| Assumption                                                                      | If wrong                                     |
|---------------------------------------------------------------------------------|----------------------------------------------|
| `sendResponseData` wants the block *with* its checksum byte (the demo app sends `00 00`) | the VMC NAKs every data reply: drop the CHK in `deliverOne()` |
| `receiveCommand` returns `<= 0` promptly when nothing arrived                   | if it blocks, the loop is simply slower; if it busy-returns, raise `IDLE_MS` |
| a return value `< 0` means failure, `>= 0` success                              | `TRANSPORT_FAILURE` events with `nativeCode` tell you which |

Values to confirm with the machine's owner (all in `rn-app/src/device/session/types.ts`, `DEFAULT_CONFIG`):
reader identity (manufacturer code `RAB`, serial, model, version), currency (`1682H` = SAR), scale factor and
decimal places, whether multivend is wanted.

## Tests

| Where                                            | What                                                                   | Count |
|--------------------------------------------------|------------------------------------------------------------------------|-------|
| device-lib/core                                  | hex, unsigned reads, checksum                                          | 3     |
| device-lib/testing                               | the puppet: connect, mailbox, NAK policy, RESET, drop, timeout, disconnect | 8 |
| device-lib/transport-mdb                         | the real transport over a scripted port: open failure, missing .so, POLL, bad CHK, RESET, timeout | 11 |
| device-lib/rn-bridge                             | the bridge over the puppet: events, error codes, reconnect, close      | 7     |
| rn-app/src/device/codec                          | bytes, every message round trip, the guide's flows, the byte-literal guard | 75 |
| rn-app/src/device/session (+ testing)            | handshake, Level 1, Level 2, Level 3, failures, the TypeScript puppet   | 31    |
| rn-app/src/features/debug                        | the screen, driven by the puppet                                       | 7     |

## Out of scope

iOS (the CM30 is Android), the non-cashless MDB peripherals (address 60H), file transfer, coupons, remote vend,
expanded-currency mode. Where the real VMC uses one of those, the log shows `?? unknown message` and Kotlin has
already ACKed the block.
