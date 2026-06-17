/**
 * Example consumer for `react-native-live-activity-kit`.
 *
 * A minimal order-tracking demo: check whether Live Activities are enabled,
 * start one with a sample order state, advance it on a timer (Preparing →
 * On the way → Delivered) so you can watch the Lock Screen card and the Dynamic
 * Island update live, then end it. It also subscribes to the per-activity push
 * token and the push-to-start token and logs them — those are exactly the values
 * you would forward to your backend so it can drive the activity remotely via
 * `react-native-live-activity-kit/server`.
 *
 * This is a Nitro module AND it needs a generated widget extension — it needs a
 * dev build, not Expo Go:
 *   cd example
 *   npx expo prebuild --clean
 *   npx expo run:ios --device
 *
 * Live Activities are iOS-only; on Android/web every call here is a safe no-op.
 *
 * This file ships with the GitHub repo only, not the npm tarball.
 */

import * as LiveActivity from 'react-native-live-activity-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// The ordered "stages" we walk the order through on a timer.
const STAGES: ReadonlyArray<LiveActivity.LiveActivityState> = [
  {
    title: 'Order #1234',
    subtitle: 'Margherita + Garlic bread',
    status: 'Preparing',
    body: 'Your order is being prepared.',
    progress: 0.25,
    imageName: 'bag.fill',
    tintColorHex: '#FF9500',
    leading: 'Acme',
    trailing: '15 min',
  },
  {
    title: 'Order #1234',
    subtitle: 'Margherita + Garlic bread',
    status: 'On the way',
    body: 'Alex is heading to you.',
    progress: 0.7,
    imageName: 'bicycle',
    tintColorHex: '#34C759',
    leading: 'Acme',
    trailing: '8 min',
  },
  {
    title: 'Order #1234',
    subtitle: 'Margherita + Garlic bread',
    status: 'Delivered',
    body: 'Enjoy your meal!',
    progress: 1,
    imageName: 'checkmark.seal.fill',
    tintColorHex: '#34C759',
    leading: 'Acme',
    trailing: 'Done',
  },
];

export default function App() {
  const [enabled, setEnabled] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [pushToStartToken, setPushToStartToken] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const idRef = useRef<string | null>(null);
  const stageRef = useRef(0);

  const append = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 40));
  }, []);

  // Subscribe to enablement + token streams once.
  useEffect(() => {
    setEnabled(LiveActivity.areActivitiesEnabled());

    const enablementSub = LiveActivity.addEnablementListener((value) => {
      setEnabled(value);
      append(`enablement → ${value}`);
    });

    // Per-activity APNs *update* token: send this to your backend so it can push
    // updates to this specific activity. It can also rotate — this fires again.
    const tokenSub = LiveActivity.addPushTokenListener(({ id, token }) => {
      setPushToken(token);
      append(`update token for ${id}: ${token.slice(0, 12)}…`);
      // POST { id, token } to your backend here.
    });

    // Push-to-start token (iOS 17.2+): send this to your backend so it can start
    // a brand-new activity remotely, even while the app is killed.
    const ptsSub = LiveActivity.addPushToStartTokenListener((token) => {
      setPushToStartToken(token);
      append(`push-to-start token: ${token.slice(0, 12)}…`);
      // POST { token } to your backend here.
    });

    const stateSub = LiveActivity.addActivityStateListener(({ id, state }) => {
      append(`activity ${id} → ${state}`);
    });

    LiveActivity.getPushToStartToken().then((t) => t && setPushToStartToken(t));

    return () => {
      enablementSub.remove();
      tokenSub.remove();
      ptsSub.remove();
      stateSub.remove();
    };
  }, [append]);

  const onStart = useCallback(async () => {
    try {
      const activity = await LiveActivity.startLiveActivity({
        attributes: { name: 'Order #1234', extra: { restaurant: 'Acme' } },
        state: STAGES[0],
        // a relative "ETA" timer the template can render:
        relevanceScore: 100,
      });
      idRef.current = activity.id;
      stageRef.current = 0;
      setActivityId(activity.id);
      setStage(0);
      if (activity.pushToken) setPushToken(activity.pushToken);
      append(`started ${activity.id}`);
    } catch (e) {
      append(`start failed: ${(e as LiveActivity.LiveActivityError).message}`);
    }
  }, [append]);

  const onAdvance = useCallback(async () => {
    const id = idRef.current;
    if (id == null) return;
    const next = Math.min(stageRef.current + 1, STAGES.length - 1);
    stageRef.current = next;
    setStage(next);
    await LiveActivity.updateLiveActivity(id, {
      state: STAGES[next],
      alert: { title: 'Order update', body: STAGES[next].status ?? 'Updated' },
    });
    append(`updated → ${STAGES[next].status}`);
  }, [append]);

  const onEnd = useCallback(async () => {
    const id = idRef.current;
    if (id == null) return;
    await LiveActivity.endLiveActivity(id, {
      state: STAGES[STAGES.length - 1],
      dismissalPolicy: 'after',
      dismissalDate: Date.now() + 5_000, // linger 5s, then dismiss
    });
    append(`ended ${id}`);
    idRef.current = null;
    setActivityId(null);
  }, [append]);

  // Auto-advance the order on a timer once it's running, so you can watch the
  // Lock Screen / Dynamic Island animate without tapping.
  useEffect(() => {
    if (activityId == null) return;
    const handle = setInterval(() => {
      if (stageRef.current < STAGES.length - 1) onAdvance();
    }, 8_000);
    return () => clearInterval(handle);
  }, [activityId, onAdvance]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Live Activity Kit</Text>
      <Text style={styles.subtitle}>Order-tracking demo</Text>

      {Platform.OS !== 'ios' && (
        <Text style={styles.warn}>
          Live Activities are iOS-only — every call is a no-op on this platform.
        </Text>
      )}

      <View style={styles.row}>
        <Stat label="Enabled" value={enabled ? 'yes' : 'no'} />
        <Stat label="Activity" value={activityId ? 'running' : 'none'} />
        <Stat label="Stage" value={STAGES[stage].status ?? '—'} />
      </View>

      <View style={styles.buttons}>
        <Button title="Start" onPress={onStart} disabled={!enabled || activityId != null} />
        <Button title="Advance" onPress={onAdvance} disabled={activityId == null} />
        <Button title="End" onPress={onEnd} disabled={activityId == null} />
      </View>

      <View style={styles.tokens}>
        <Token label="Update token" value={pushToken} />
        <Token label="Push-to-start token" value={pushToStartToken} />
      </View>

      <Text style={styles.logHeader}>Event log</Text>
      {log.map((line, i) => (
        <Text key={i} style={styles.logLine}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Token({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.token}>
      <Text style={styles.tokenLabel}>{label}</Text>
      <Text style={styles.tokenValue} numberOfLines={1}>
        {value ? `${value.slice(0, 20)}…` : '— (not issued yet)'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  content: { padding: 16, paddingTop: 64 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 14, color: '#8a94a6', marginBottom: 16 },
  warn: { color: '#FF9500', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 16, fontWeight: '700', color: '#34C759' },
  statLabel: { fontSize: 12, color: '#8a94a6' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tokens: { marginBottom: 16, gap: 8 },
  token: { padding: 10, backgroundColor: '#121821', borderRadius: 8 },
  tokenLabel: { color: '#8a94a6', fontSize: 12 },
  tokenValue: { color: '#fff', fontVariant: ['tabular-nums'] },
  logHeader: { color: '#8a94a6', fontSize: 12, marginBottom: 6, marginTop: 8 },
  logLine: { color: '#aeb6c2', fontSize: 12, fontVariant: ['tabular-nums'] },
});
