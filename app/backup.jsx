import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { Screen, SectionHeader } from '../components/ui/Screen';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Text } from '../components/ui/Text';
import { useTheme } from '../components/ui/ThemeProvider';
import { useBackupStore } from '../stores/backupStore';
import { useSettingsStore } from '../stores/settingsStore';
import { fileService } from '../services/fileService';
import { describeConflict } from '../utils/backup';

const CONFLICT_OPTIONS = [
  { value: 'keep', label: 'Keep existing' },
  { value: 'replace', label: 'Replace' },
  { value: 'skip', label: 'Skip' },
];

export default function BackupScreen() {
  const { colors, spacing } = useTheme();
  const currency = useSettingsStore((state) => state.currency);

  const isBusy = useBackupStore((state) => state.isBusy);
  const error = useBackupStore((state) => state.error);
  const preview = useBackupStore((state) => state.preview);
  const plan = useBackupStore((state) => state.plan);
  const exportBackup = useBackupStore((state) => state.exportBackup);
  const startImport = useBackupStore((state) => state.startImport);
  const cancelImport = useBackupStore((state) => state.cancelImport);
  const beginMerge = useBackupStore((state) => state.beginMerge);
  const backFromMerge = useBackupStore((state) => state.backFromMerge);
  const resolveConflict = useBackupStore((state) => state.resolveConflict);
  const confirmMerge = useBackupStore((state) => state.confirmMerge);
  const performFullRestore = useBackupStore((state) => state.performFullRestore);
  const clearError = useBackupStore((state) => state.clearError);

  // Surface store errors as an alert; each carries its own title + message.
  useEffect(() => {
    if (!error) return;
    Alert.alert(error.title, error.message, [{ text: 'OK', onPress: clearError }]);
  }, [error, clearError]);

  function confirmRestore() {
    Alert.alert(
      'Replace everything?',
      'Full restore deletes all current data first. Budgetarian saves a recovery backup of ' +
        'your current data before replacing it — the restore is cancelled if that save fails.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save recovery & restore',
          style: 'destructive',
          onPress: () => {
            performFullRestore();
          },
        },
      ],
    );
  }

  const conflicts = plan ? plan.groups.filter((group) => group.state === 'conflict') : [];

  return (
    <Screen topInset>
      <Stack.Screen options={{ title: 'Export & Import' }} />

      <SectionHeader title="Export" />
      <Card>
        <Text variant="body">Backup file</Text>
        <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>
          All budgets, transactions, breakdown items, tags, reminders and settings as one
          JSON file. Nothing leaves your device unless you save or share it yourself.
        </Text>
        {fileService.supported ? (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Button
              label={isBusy && !preview && !plan ? 'Exporting…' : 'Save backup file'}
              icon="folder"
              onPress={() => exportBackup('save')}
              disabled={isBusy}
            />
            <Button
              label="Share"
              icon="share"
              variant="secondary"
              onPress={() => exportBackup('share')}
              disabled={isBusy}
            />
          </View>
        ) : (
          <Text variant="caption" tone="warning" style={{ marginTop: spacing.sm }}>
            Not available in the browser preview — run Budgetarian on your device to export.
          </Text>
        )}
      </Card>

      <View style={{ height: spacing.xl }} />

      <SectionHeader title="Import" />
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          onPress={() => (fileService.supported ? startImport() : undefined)}
          disabled={isBusy || !fileService.supported}
          style={({ pressed }) => [
            styles.option,
            { opacity: pressed || !fileService.supported ? 0.7 : 1 },
          ]}
        >
          <View style={styles.flex}>
            <Text variant="body">Import from a file</Text>
            <Text variant="caption" tone="faint">
              Choose a Budgetarian backup to preview before anything changes
            </Text>
          </View>
          {isBusy && !preview && !plan ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="chevronRight" size={16} color={colors.textFaint} />
          )}
        </Pressable>
      </Card>

      {preview && !plan ? (
        <>
          <View style={{ height: spacing.xl }} />
          <SectionHeader title="Preview" />
          <Card>
            <Text variant="heading">{preview.fileName}</Text>
            {preview.createdAt ? (
              <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>
                Exported {preview.createdAt.slice(0, 10)}
                {preview.appVersion ? ` · Budgetarian ${preview.appVersion}` : ''}
              </Text>
            ) : null}

            <View style={[styles.counts, { marginTop: spacing.md }]}>
              <CountRow label="Budgets" value={preview.counts.budgets} />
              <CountRow label="Transactions" value={preview.counts.transactions} />
              <CountRow label="Breakdown items" value={preview.counts.breakdownItems} />
              <CountRow label="Tags" value={preview.counts.tags} />
              <CountRow
                label="Reminders"
                value={`${preview.counts.reminders} (${preview.counts.activeReminders} active)`}
              />
              <CountRow label="Settings" value={preview.counts.settingsKeys} />
            </View>

            {preview.warnings.length > 0 ? (
              <View style={{ marginTop: spacing.md }}>
                <Text variant="label" tone="warning">
                  Things we had to adjust
                </Text>
                {preview.warnings.slice(0, 8).map((warning) => (
                  <Text
                    key={warning}
                    variant="caption"
                    tone="warning"
                    style={{ marginTop: 4 }}
                  >
                    • {warning}
                  </Text>
                ))}
                {preview.warnings.length > 8 ? (
                  <Text variant="caption" tone="warning" style={{ marginTop: 4 }}>
                    • …and {preview.warnings.length - 8} more
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.actions, { marginTop: spacing.lg }]}>
              <Button
                label={isBusy ? 'Working…' : 'Merge with my data'}
                onPress={beginMerge}
                disabled={isBusy}
                style={styles.action}
              />
              <Button
                label="Full restore"
                variant="danger"
                onPress={confirmRestore}
                disabled={isBusy}
                style={styles.action}
              />
            </View>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={cancelImport}
              disabled={isBusy}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        </>
      ) : null}

      {plan ? (
        <>
          <View style={{ height: spacing.xl }} />
          <SectionHeader title="Review merge" />
          <Text variant="caption" tone="muted" style={{ marginBottom: spacing.sm }}>
            {plan.counts.new} new record(s) will be added and {plan.counts.identical} already
            match. {conflicts.length} record(s) exist with different data — choose what happens
            to each.
          </Text>

          {conflicts.length > 0 ? (
            <Card padded={false}>
              {conflicts.map((group, index) => {
                const description = describeConflict(group, { currency });
                return (
                  <View
                    key={group.key}
                    style={[
                      styles.conflictRow,
                      index < conflicts.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <Text variant="body">{description.title}</Text>
                    <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>
                      {description.detail}
                    </Text>
                    <SegmentedControl
                      options={CONFLICT_OPTIONS}
                      value={group.resolution ?? 'keep'}
                      onChange={(resolution) => resolveConflict(group.key, resolution)}
                      dense
                      style={{ marginTop: spacing.sm }}
                    />
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card>
              <Text variant="body">No conflicts — the merge only adds new records.</Text>
            </Card>
          )}

          <View style={[styles.actions, { marginTop: spacing.lg }]}>
            <Button
              label={isBusy ? 'Merging…' : 'Apply merge'}
              onPress={confirmMerge}
              disabled={isBusy}
              style={styles.action}
            />
            <Button
              label="Back"
              variant="secondary"
              onPress={backFromMerge}
              disabled={isBusy}
              style={styles.action}
            />
          </View>
        </>
      ) : null}

      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

function CountRow({ label, value }) {
  return (
    <View style={[styles.countRow]}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="label">{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  conflictRow: { padding: 14 },
  counts: { gap: 2 },
  countRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  flex: { flex: 1 },
  option: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
