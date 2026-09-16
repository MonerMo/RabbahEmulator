/**
 * Module 7 - DebugScreen.tsx: the screen the reviewer uses. Layout only; every decision lives in the hook.
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { DEFAULT_CONFIG } from '../../device/session';
import { useDebugController, type DebugDevice, type LogRow } from './useDebugController';

/** 1000 scaled units -> "10.00" (scale 1, two decimals - DEFAULT_CONFIG). */
const money = (units: number) => ((units * DEFAULT_CONFIG.scale) / 10 ** DEFAULT_CONFIG.decimals).toFixed(DEFAULT_CONFIG.decimals);

const LINK_TONE: Record<string, string> = { connected: '#1baf7a', connecting: '#eda100', fault: '#d03b3b', disconnected: '#8a8984' };
const SESSION_TONE: Record<string, string> = { inactive: '#8a8984', disabled: '#eda100', enabled: '#1baf7a', sessionIdle: '#2a78d6', vend: '#4a3aa7', negativeVend: '#4a3aa7' };

function Chip({ text, color, testID }: { text: string; color: string; testID: string }) {
  return (
    <View style={[s.chip, { backgroundColor: color }]}>
      <Text style={s.chipText} testID={testID}>{text}</Text>
    </View>
  );
}

function Btn({ label, onPress, testID, danger, active }: { label: string; onPress: () => void; testID?: string; danger?: boolean; active?: boolean }) {
  return (
    <Pressable onPress={onPress} testID={testID} style={[s.btn, danger && s.btnDanger, active && s.btnActive]}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

function FrameRow({ row }: { row: LogRow }) {
  return (
    <Text style={[s.row, row.direction === 'in' ? s.rowIn : s.rowOut]} testID="frame-row">
      {`${row.seq} ${row.direction === 'in' ? 'VMC ->' : '   <-'} ${row.hex}   ${row.label}`}
    </Text>
  );
}

export function DebugScreen({ device }: { device?: DebugDevice }) {
  const c = useDebugController(device);
  const [hex, setHex] = useState('');
  const fake = c.mode === 'fake';
  const v = c.session;

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.title}>CM30 MDB Bridge</Text>
        <Chip testID="chip-link" text={c.link.state + (c.link.errorCode ? ` ${c.link.errorCode}` : '')} color={LINK_TONE[c.link.state] ?? '#8a8984'} />
        <Chip testID="chip-session" text={v.state} color={SESSION_TONE[v.state]} />
      </View>
      {c.link.message ? <Text style={s.small}>{c.link.message}</Text> : null}

      <View style={s.rowWrap}>
        <Btn label="fake" active={fake} onPress={() => c.setMode('fake')} testID="mode-fake" />
        <Btn label="real (CM30)" active={!fake} onPress={() => c.setMode('real')} testID="mode-real" />
        <Btn label="Connect" onPress={c.actions.connect} testID="btn-connect" />
        <Btn label="Disconnect" onPress={c.actions.disconnect} testID="btn-disconnect" />
      </View>

      <Text style={s.sectionTitle}>Session</Text>
      <Text style={s.small}>
        {`level ${v.level}${v.vmcLevel ? ` (VMC ${v.vmcLevel})` : ''} · funds ${money(v.funds)} · sales ${v.sales} · cash sales ${v.cashSales}${v.clock ? ` · clock ${v.clock}` : ''}${v.expecting ? ` · waiting: ${v.expecting}` : ''}`}
      </Text>
      <Text style={s.note} testID="session-note">{v.note}</Text>
      <View style={s.rowWrap}>
        <Btn label="Begin session 10.00" onPress={() => c.actions.beginSession(1000)} testID="btn-begin" />
        <Btn label={v.denyNext ? 'Deny next: ON' : 'Deny next vend'} active={v.denyNext} onPress={c.actions.toggleDenyNext} testID="btn-deny" />
        <Btn label="Time/date" onPress={() => c.actions.requestTimeDate()} />
        <Btn label="Cancel session" onPress={() => c.actions.cancelSession()} />
      </View>

      {fake ? (
        <View>
          <Text style={s.sectionTitle}>Fake VMC - you are the machine</Text>
          <View style={s.rowWrap}>
            <Btn label="RESET" onPress={c.vmc.reset} testID="vmc-reset" />
            <Btn label="SETUP" onPress={c.vmc.setup} testID="vmc-setup" />
            <Btn label="REQUEST ID" onPress={c.vmc.requestId} />
            <Btn label="ENABLE" onPress={c.vmc.enable} testID="vmc-enable" />
            <Btn label="DISABLE" onPress={c.vmc.disable} />
          </View>
          <View style={s.rowWrap}>
            <Btn label="VEND REQUEST 1.00 #5" onPress={() => c.vmc.vendRequest()} testID="vmc-vend" />
            <Btn label="VEND SUCCESS" onPress={() => c.vmc.vendSuccess()} testID="vmc-success" />
            <Btn label="VEND FAILURE" onPress={c.vmc.vendFailure} />
            <Btn label="SESSION COMPLETE" onPress={c.vmc.sessionComplete} testID="vmc-complete" />
          </View>
          <View style={s.rowWrap}>
            <Btn label="CASH SALE" onPress={c.vmc.cashSale} />
            <Btn label="NEG VEND 1.00" onPress={c.vmc.negVendRequest} />
            <Btn label="WRITE TIME" onPress={c.vmc.writeTime} />
            <Btn label="Pull cable" onPress={c.vmc.pullCable} danger testID="vmc-cable" />
          </View>
        </View>
      ) : null}

      <View style={s.rowWrap}>
        <TextInput
          style={s.input} value={hex} onChangeText={setHex} placeholder="raw hex, e.g. 05 00 64 69"
          autoCapitalize="none" autoCorrect={false} testID="hex-input"
        />
        <Btn label="Send" onPress={() => c.actions.sendHex(hex)} testID="btn-send" />
      </View>
      {c.error ? <Text style={s.error} testID="error">{c.error}</Text> : null}

      <View style={s.logHead}>
        <Text style={s.sectionTitle}>{`Frames (${c.rows.length})`}</Text>
        <Text style={s.small}>hide POLL</Text>
        <Switch value={c.hidePoll} onValueChange={c.setHidePoll} testID="hide-poll" />
        <Btn label="Clear" onPress={c.actions.clearLog} />
      </View>
      <FlatList style={s.log} data={c.rows} keyExtractor={(r) => String(r.seq)} renderItem={({ item }) => <FrameRow row={item} />} testID="frame-log" />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, paddingTop: 40, paddingHorizontal: 12, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 'bold', flex: 1 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4, alignItems: 'center' },
  btn: { backgroundColor: '#2a78d6', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  btnDanger: { backgroundColor: '#d03b3b' },
  btnActive: { backgroundColor: '#184f95' },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginTop: 6, color: '#52514e' },
  small: { fontSize: 12, color: '#52514e' },
  note: { fontSize: 13, marginVertical: 2 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontFamily: 'monospace', fontSize: 13 },
  error: { color: '#d03b3b', fontSize: 12, marginVertical: 2 },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  log: { flex: 1, marginTop: 4 },
  row: { fontFamily: 'monospace', fontSize: 12, paddingVertical: 1 },
  rowIn: { color: '#184f95' },
  rowOut: { color: '#0d6b4a' },
});
