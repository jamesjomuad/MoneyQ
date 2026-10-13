import { SymbolView } from 'expo-symbols';

import { useTheme } from './ThemeProvider';

// expo-symbols renders SF Symbols on iOS and Material icons elsewhere, so it
// covers both platforms without pulling in an icon font package.
const ICONS = {
  home: { ios: 'house', android: 'home', web: 'home' },
  list: { ios: 'list.bullet.rectangle', android: 'list', web: 'list' },
  pie: { ios: 'chart.pie', android: 'pie_chart', web: 'pie_chart' },
  wallet: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  add: { ios: 'plus', android: 'add', web: 'add' },
  folder: { ios: 'folder', android: 'folder', web: 'folder' },
  folderPlus: { ios: 'folder.badge.plus', android: 'create_new_folder', web: 'create_new_folder' },
  tag: { ios: 'tag', android: 'label', web: 'label' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  chevronUp: { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' },
  drag: { ios: 'line.horizontal.3', android: 'drag_indicator', web: 'drag_indicator' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  trash: { ios: 'trash', android: 'delete_outline', web: 'delete_outline' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  pencil: { ios: 'pencil', android: 'edit', web: 'edit' },
  more: { ios: 'ellipsis', android: 'more_vert', web: 'more_vert' },
  food: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' },
  transportation: { ios: 'bus', android: 'directions_bus', web: 'directions_bus' },
  utilities: { ios: 'bolt', android: 'bolt', web: 'bolt' },
  shopping: { ios: 'bag', android: 'shopping_bag', web: 'shopping_bag' },
  entertainment: { ios: 'film', android: 'movie', web: 'movie' },
  health: { ios: 'cross.case', android: 'medical_services', web: 'medical_services' },
  education: { ios: 'book', android: 'school', web: 'school' },
  bills: { ios: 'doc.text', android: 'receipt_long', web: 'receipt_long' },
  other: { ios: 'ellipsis.circle', android: 'category', web: 'category' },
  empty: { ios: 'tray', android: 'inbox', web: 'inbox' },
  database: { ios: 'cylinder', android: 'storage', web: 'storage' },
  expense: { ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' },
  income: { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' },
  transfer: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' },
  paid: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  share: { ios: 'square.and.arrow.up', android: 'share', web: 'share' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  pin: { ios: 'pin', android: 'push_pin', web: 'push_pin' },
  pinFilled: { ios: 'pin.fill', android: 'push_pin', web: 'push_pin' },
  eye: { ios: 'eye', android: 'visibility', web: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' },
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 22, color, style }) {
  const { colors } = useTheme();
  const mapping = ICONS[name] ?? ICONS.other;

  return (
    <SymbolView
      name={mapping}
      tintColor={color ?? colors.text}
      size={size}
      style={[{ width: size, height: size }, style]}
    />
  );
}