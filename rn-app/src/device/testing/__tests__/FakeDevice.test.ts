import { FakeDevice } from '../FakeDevice';

describe('FakeDevice - the puppet in TypeScript', () => {
  test('send resolves when the next POLL takes the block', async () => {
    const d = new FakeDevice();
    await d.connect('fake');
    const p = d.send('05 00 64 69');
    d.fakeVmc.polls();
    expect(await p).toBe('ack');
    expect(d.sent).toEqual(['05 00 64 69']);
    expect(d.frames.map((f) => `${f.direction} ${f.hex}`)).toEqual(['in 12 12', 'out 05 00 64 69']);
  });

  test('errors carry the same codes as the bridge', async () => {
    const d = new FakeDevice();
    await expect(d.send('05 05')).rejects.toMatchObject({ code: 'DISCONNECTED' });
    await d.connect('fake');
    await expect(d.send('0G')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    const p = d.send('05 05');
    d.fakeVmc.dropLink();
    await expect(p).rejects.toMatchObject({ code: 'DISCONNECTED', message: 'disconnected: cable pulled' });
    expect(d.state()).toBe('fault');
  });

  test('RESET throws queued blocks away; a NAK policy is reported', async () => {
    const d = new FakeDevice();
    await d.connect('fake');
    const p = d.send('05 05');
    d.fakeVmc.sends('10 10');
    await expect(p).rejects.toMatchObject({ code: 'DISCONNECTED', message: 'disconnected: reset' });
    d.replyPolicy = () => 'nak';
    const q = d.send('05 05');
    d.fakeVmc.polls();
    expect(await q).toBe('nak');
  });
});
