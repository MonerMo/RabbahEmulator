# @rabbah/mdb-device

The Turbo Module of the CM30 MDB Bridge (Module 4). Android only.

```ts
import { device, errorCode } from '@rabbah/mdb-device';

await device.connect('fake');                 // or 'real' on the CM30
const sub = device.onFrame((f) => console.log(f.direction, f.hex));
const reply = await device.send('05 00 64 69');   // 'ack' | 'nak' | 'ret' - resolves on the next POLL
sub.remove();
```

* `src/NativeMdbDevice.ts` - the Codegen spec (what Kotlin implements)
* `src/index.tsx` - the `device` object and `errorCode()`
* `android/.../DeviceBridge.kt` - the logic, tested with the Kotlin puppet
* `android/.../MdbDeviceModule.kt` - the React types only

Built and tested only through `../../rn-app` (autolinked as `:rabbah_mdb-device`). See the root README.
