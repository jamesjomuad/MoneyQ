import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../ui/ThemeProvider';

const HOLD_MS = 320; // finger held this still before the row lifts
const MOVE_SLOP = 10; // px — moving further before the lift means tap/scroll, not drag
const DRAG_THRESHOLD = 3; // px — released without this much travel is a long press, not a reorder
const REFLOW_MS = 190; // siblings sliding into their slots under the finger
const LANDING_MS = 150; // dragged row settling into the opened gap
const SETTLE_MS = 90; // grace after landing before the reorder is committed
const UNDO_MS = 160; // row sliding back when the drop cancels
const SCALE_MS = 160; // lift / lower scale
const AUTO_MS = 40; // edge auto-scroll tick interval
const AUTO_STEP = 14; // px scrolled per tick
const EDGE = 56; // distance from the viewport edge that triggers auto-scroll

/**
 * Long-press drag-and-drop reordering for the shared row cards.
 *
 * Mechanics (all plain JS/Reanimated — no new dependencies):
 *
 * - Every row is wrapped in a manually-activated Pan. The handler NEVER
 *   activates itself, so taps open rows and normal scrolling behave exactly
 *   as before. A hold timer starts on touch-down; if the finger stays inside
 *   a small radius for HOLD_MS the row lifts. Any real movement before that
 *   fails the handler (fled) so the ScrollView or the row's Pressable keeps
 *   the touch.
 * - While lifted, the row follows the finger (translateY + a slight scale,
 *   elevation, and raised zIndex) and the sibling rows live-reflow: each one
 *   animates to the slot it would occupy if the drop happened now, so a gap
 *   opens under the finger instead of a separate placeholder bar.
 * - Near the top/bottom of the scroll viewport the content auto-scrolls and
 *   the dragged row absorbs the delta so it never leaves the finger. The
 *   parent screen must set scrollEnabled={false} while a drag is active (the
 *   onLiftChange callback reports this) — the Android-native ScrollView
 *   otherwise steals the touch stream mid-drag; see Screen.jsx.
 * - On release the dragged row lands in the gap, then onReorder(item,
 *   targetIndex) persists the move (store → repository → adapter). All row
 *   shifts are zeroed in the SAME layout-effect pass that commits the new
 *   data order, so the visual result of the drag and the persisted order are
 *   identical and nothing ever re-renders at a stale position. A failed or
 *   no-op reorder slides every row back — no data was written, so nothing
 *   else can drift.
 * - Release without drag distance calls onLongPressIdle(item) (optional) so a
 *   screen can keep its own hold-to-act behavior. Home no longer passes it —
 *   selection there is explicit (checkbox mode), so a still hold simply does
 *   nothing. Screens should null a lifted row's own press handlers
 *   (renderItem receives `lifted`) so their Pressables cannot race ours.
 *
 * Geometry comes from each wrapper's onLayout (relative to this container,
 * which scrolls with its content), so no hardcoded row heights or paddings
 * are assumed; heights may vary per row.
 */
export function DraggableRows({
  items,
  renderItem, // (item, index, total, lifted, reorder) => element
  onReorder, // async (item, targetIndex) — targetIndex is the final index in items
  onLongPressIdle, // (item) — lifted row released without dragging
  onLiftChange, // (key | null) — parent should lock its scroll while non-null
  resolveTarget, // optional (item, fromIndex, candidateIndex, items) => index
  disabled = false,
  scroll, // optional { scrollTo(y), getOffset(), getViewport(cb) }
}) {
  const reduced = useReducedMotion();
  const [liftedKey, setLiftedKey] = useState(null);

  const containerRef = useRef(null);
  const rows = useRef(new Map()); // key -> { shift, armed, top, height }
  const lift = useRef(null); // active drag bookkeeping (see arm())
  const holdTimer = useRef(null);
  const autoTimer = useRef(null);
  const settleTimer = useRef(null);
  const commitPending = useRef(false);
  const pressed = useRef(new Set()); // keys with a finger still down
  const released = useRef(null); // key released without lifting (race guard)

  // Latest-value refs: written by the effect below (never during render —
  // React's compiler rules treat render-phase ref writes as bugs), read by
  // event-time callbacks. fnsRef keeps the stable `controller` wrappers
  // calling THIS render's handlers so props like `disabled` are never stale.
  const itemsRef = useRef(items);
  const scrollRef = useRef(scroll);
  const hooksRef = useRef(null);
  const fnsRef = useRef(null);
  const orderSig = items.map((item) => item.key).join('|');

  const dur = (ms) => (reduced ? 0 : ms);

  function clearHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function clearAuto() {
    if (autoTimer.current) {
      clearInterval(autoTimer.current);
      autoTimer.current = null;
    }
  }

  // A finger touched down on a row: start the hold timer. The gesture handler
  // itself stays dormant (manual activation) until either the timer wins
  // (arm) or the finger demonstrably moves (touchFled).
  function touchDown(key) {
    if (disabled || commitPending.current || lift.current) return;
    const index = itemsRef.current.findIndex((item) => item.key === key);
    if (index < 0) return;
    released.current = null;
    pressed.current.add(key);
    clearHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      arm(key, index);
    }, HOLD_MS);
  }

  // The finger moved past the slop before the hold finished: this touch is a
  // tap or a scroll, so the potential drag is dead for as long as it is down.
  function touchFled() {
    clearHold();
  }

  // Hold completed with a still finger: lift the row.
  function arm(key, index) {
    if (!pressed.current.has(key) || released.current === key || lift.current) {
      return;
    }
    const item = itemsRef.current[index];
    const row = rows.current.get(key);
    if (!item || !row || !Number.isFinite(row.top)) return;
    const offset = scrollRef.current?.getOffset?.() ?? 0;
    lift.current = {
      key,
      item,
      index,
      top: row.top,
      translation: 0,
      localY: row.height / 2,
      dragY: 0,
      scrollComp: 0,
      curOffset: offset,
      offset0: offset,
      winRect: null,
      host: null,
      started: false,
      moved: false,
      released: false,
      target: null,
      landing: 0,
      applied: {},
      sigAtStart: orderSig,
    };
    row.armed.value = 1; // next onTouchesMove worklet calls manager.activate()
    setLiftedKey(key);
    hooksRef.current?.onLiftChange(key);
    containerRef.current?.measureInWindow((x, y, w, h) => {
      if (lift.current?.key === key) lift.current.winRect = { y, h };
    });
    scrollRef.current?.getViewport?.((viewport) => {
      if (lift.current?.key === key) lift.current.host = viewport;
    });
    clearAuto();
    autoTimer.current = setInterval(autoTick, AUTO_MS);
  }

  // Recompute the drop slot from the dragged row's lifted center and slide
  // every sibling to the position it would hold in the post-reorder layout.
  function recompute() {
    const L = lift.current;
    if (!L) return;
    const list = itemsRef.current;
    const n = list.length;
    const geoms = [];
    for (const item of list) {
      const row = rows.current.get(item.key);
      if (!row || !Number.isFinite(row.top)) return;
      geoms.push(row);
    }
    const cy = geoms[L.index].top + geoms[L.index].height / 2 + L.dragY;
    let j = 0;
    for (let k = 0; k < n; k += 1) {
      if (k === L.index) continue;
      if (geoms[k].top + geoms[k].height / 2 < cy) j += 1;
    }
    const hook = hooksRef.current;
    if (typeof hook?.resolveTarget === 'function') {
      j = hook.resolveTarget(L.item, L.index, j, list);
    }
    j = Math.max(0, Math.min(n - 1, Math.trunc(j)));
    L.target = j;

    // Final layout simulation: reorder the index sequence, then cumulative
    // heights give every row its destination top. Uniform rows behave
    // exactly; mixed heights stay correct because each row's own height is
    // measured, never assumed.
    const seq = [];
    for (let i = 0; i < n; i += 1) if (i !== L.index) seq.push(i);
    seq.splice(j, 0, L.index);
    const newTops = new Array(n);
    let cursor = 0;
    for (const src of seq) {
      newTops[src] = cursor;
      cursor += geoms[src].height;
    }
    L.landing = newTops[L.index] - geoms[L.index].top;
    for (let k = 0; k < n; k += 1) {
      if (k === L.index) continue;
      const want = newTops[k] - geoms[k].top;
      if (Math.abs((L.applied[k] || 0) - want) < 0.5) continue;
      L.applied[k] = want;
      geoms[k].shift.value = withTiming(want, {
        duration: dur(REFLOW_MS),
        easing: Easing.inOut(Easing.ease),
      });
    }
  }

  function dragMove(key, translationY, localY) {
    const L = lift.current;
    if (!L || L.key !== key || L.released || commitPending.current) return;
    L.translation = translationY;
    L.localY = localY;
    L.started = true;
    if (Math.abs(translationY) > DRAG_THRESHOLD) L.moved = true;
    L.dragY = translationY + L.scrollComp;
    const row = rows.current.get(key);
    if (row) row.shift.value = L.dragY;
    recompute();
  }

  // Edge auto-scroll: move the content when the finger nears the viewport
  // edge, then hand the actually-scrolled distance to the lifted row so it
  // stays pinned under the finger. Only our own scrolls happen (the screen
  // locks user scrolling), and the position is re-read every tick so clamp
  // boundaries self-correct instead of drifting.
  function autoTick() {
    const L = lift.current;
    const api = scrollRef.current;
    if (!L || !L.started || L.released || commitPending.current) return;
    if (!api || !L.host || !L.winRect) return;
    const fingerY =
      L.winRect.y - (L.curOffset - L.offset0) + L.top + L.localY;
    let dir = 0;
    if (fingerY < L.host.y + EDGE) dir = -1;
    else if (fingerY > L.host.y + L.host.h - EDGE) dir = 1;
    const base = api.getOffset?.() ?? L.curOffset;
    const realDelta = base - L.curOffset;
    L.curOffset = base;
    if (Math.abs(realDelta) > 0.5) {
      L.scrollComp += realDelta;
      L.dragY = L.translation + L.scrollComp;
      const row = rows.current.get(L.key);
      if (row) row.shift.value = L.dragY;
      recompute();
    }
    if (dir) api.scrollTo(Math.max(0, base + dir * AUTO_STEP));
  }

  function finishLift() {
    lift.current = null;
    setLiftedKey(null);
    hooksRef.current?.onLiftChange(null);
  }

  function resetRows(animate) {
    rows.current.forEach((row) => {
      if (animate) {
        row.shift.value = withTiming(0, {
          duration: dur(UNDO_MS),
          easing: Easing.out(Easing.ease),
        });
      } else {
        row.shift.value = 0;
      }
    });
  }

  // Touch released (onTouchesUp fires whether or not the Pan activated; onEnd
  // may also fire — the released flag makes this idempotent).
  function dragEnd(key) {
    const L = lift.current;
    if (!L || L.key !== key) {
      // No lift for this touch: a tap or a scroll. Flag it so a hold timer
      // already queued behind the release event cannot resurrect the lift.
      pressed.current.delete(key);
      if (!L) released.current = key;
      clearHold();
      return;
    }
    if (L.released) return;
    L.released = true;
    pressed.current.delete(key);
    clearHold();
    clearAuto();
    const row = rows.current.get(key);
    if (row) row.armed.value = 0;

    if (!L.moved) {
      // Held still, dropped in place: the screen's own long-press behavior.
      lift.current = null;
      resetRows(true);
      finishLift();
      hooksRef.current?.onLongPressIdle?.(L.item);
      return;
    }

    recompute(); // honour the finger's final position
    if (L.target === L.index) {
      lift.current = null;
      resetRows(true);
      finishLift();
      return;
    }

    // Land in the gap, then persist. The zeroing of shifts happens in the
    // layout pass that renders the new data order (see useLayoutEffect), so
    // landing and commit are one seamless visual step.
    if (row) {
      row.shift.value = withTiming(L.landing, {
        duration: dur(LANDING_MS),
        easing: Easing.out(Easing.ease),
      });
    }
    commitPending.current = true;
    settleTimer.current = setTimeout(async () => {
      settleTimer.current = null;
      try {
        await hooksRef.current.onReorder(L.item, L.target);
      } catch {
        // A failed persist leaves no data change; the safety undo below
        // slides the row back. Home surfaces the error toast itself.
      }
      // If the committed order came back identical (no-op or failure), the
      // layout effect never sees a new signature — undo after a beat.
      setTimeout(() => {
        if (commitPending.current && lift.current) {
          commitPending.current = false;
          lift.current = null;
          resetRows(true);
          finishLift();
        }
      }, dur(400));
    }, dur(LANDING_MS) + SETTLE_MS);
  }

  function gestureFinalize(key) {
    const L = lift.current;
    if (L && L.key === key) return; // dragEnd owns this drag's cleanup
    pressed.current.delete(key);
    clearHold();
  }

  // After every committed render, re-point the refs at that render's values
  // and handlers. Touch events only ever fire post-commit, so the gesture
  // callbacks always see fresh props/closures through these refs.
  useEffect(() => {
    itemsRef.current = items;
    scrollRef.current = scroll;
    hooksRef.current = {
      onReorder,
      onLongPressIdle,
      onLiftChange,
      resolveTarget,
    };
    fnsRef.current = {
      touchDown,
      touchFled,
      dragMove,
      dragEnd,
      gestureFinalize,
    };
  });

  const controller = useMemo(
    () => ({
      slopSq: MOVE_SLOP * MOVE_SLOP,
      register(key, shift, armed) {
        const existing = rows.current.get(key);
        if (existing && existing.shift === shift && existing.armed === armed) {
          return;
        }
        rows.current.set(key, {
          armed,
          height: 0,
          shift,
          top: Number.NaN,
        });
      },
      unregister(key) {
        rows.current.delete(key);
      },
      layout(key, top, height) {
        const row = rows.current.get(key);
        if (row) {
          row.top = top;
          row.height = height;
        }
      },
      touchDown: (key) => fnsRef.current.touchDown(key),
      touchFled: () => fnsRef.current.touchFled(),
      dragMove: (key, translationY, localY) =>
        fnsRef.current.dragMove(key, translationY, localY),
      dragEnd: (key) => fnsRef.current.dragEnd(key),
      gestureFinalize: (key) => fnsRef.current.gestureFinalize(key),
      // Accessibility equivalent of a drag: move one slot, clamped through the
      // same resolveTarget the gesture uses, so it can never cross a section
      // boundary the list forbids. No-ops at the ends and while disabled.
      reorder(key, delta) {
        const list = itemsRef.current;
        if (!list?.length) return;
        const from = list.findIndex((entry) => entry.key === key);
        if (from === -1) return;
        const item = list[from];
        let to = from + delta;
        const resolve = hooksRef.current?.resolveTarget;
        if (typeof resolve === 'function') to = resolve(item, from, to, list);
        if (!Number.isFinite(to)) return;
        to = Math.max(0, Math.min(list.length - 1, to));
        if (to === from) return;
        hooksRef.current?.onReorder?.(item, to);
      },
    }),
    [],
  );

  // What each row advertises to assistive tech: the directions it can actually
  // move. Computed against the same resolver as the drag, so the announced
  // actions always match the gesture's limits.
  const reorderFor = (item, index) => {
    if (disabled) return null;
    const total = items.length;
    const target = (candidate) => {
      if (candidate < 0 || candidate > total - 1) return candidate;
      return typeof resolveTarget === 'function'
        ? resolveTarget(item, index, candidate, items)
        : candidate;
    };
    const upTarget = index > 0 ? target(index - 1) : index;
    const downTarget = index < total - 1 ? target(index + 1) : index;
    const canMoveUp = index > 0 && upTarget !== index;
    const canMoveDown = index < total - 1 && downTarget !== index;
    if (!canMoveUp && !canMoveDown) return null;
    return {
      canMoveUp,
      canMoveDown,
      move: (delta) => controller.reorder(item.key, delta),
    };
  };

  // The commit step: the moment the parent hands us a different key order,
  // the drag's visual result and the persisted order describe the SAME
  // layout. Zeroing every shift inside this pre-paint pass means the next
  // frame shows rows exactly where the drop left them — no flash, no jump.
  useLayoutEffect(() => {
    if (!commitPending.current) return;
    const L = lift.current;
    if (L && L.sigAtStart === orderSig) return; // order unchanged (yet)
    commitPending.current = false;
    rows.current.forEach((row) => {
      row.shift.value = 0;
    });
    finishLift();
  }, [orderSig]);

  // Unmount safety: never leave timers or a lifted phantom behind.
  useEffect(
    () => () => {
      clearHold();
      clearAuto();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  return (
    <View ref={containerRef} collapsable={false}>
      {items.map((item, index) => (
        <RowCell
          key={item.key}
          armedGuard={disabled}
          controller={controller}
          index={index}
          item={item}
          lifted={liftedKey === item.key}
          renderItem={renderItem}
          reorder={reorderFor(item, index)}
          total={items.length}
        />
      ))}
    </View>
  );
}

/**
 * One row: an Animated wrapper the drag steers (translateY = its own shift
 * shared value; scale while lifted) around whatever the screen renders. The
 * Pan inside is manually activated — it only ever takes the touch after the
 * container's hold timer wins, so taps and scrolling are untouched.
 */
function RowCell({ item, index, total, renderItem, reorder, controller, lifted, armedGuard }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const shift = useSharedValue(0);
  const armed = useSharedValue(0);
  const scale = useSharedValue(1);
  const origin = useSharedValue({ x: 0, y: 0 });
  const fled = useSharedValue(0);

  // The row registers itself (and its shared values) the first time it is
  // laid out — deliberately via the layout event, not an effect: shared
  // values must never be "used in an effect" or React's compiler rules treat
  // the worklet writes below as mutating hook arguments.
  useEffect(() => () => controller.unregister(item.key), [controller, item.key]);

  useEffect(() => {
    scale.value = withTiming(lifted ? 1.03 : 1, {
      duration: reduced ? 0 : SCALE_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [lifted, reduced, scale]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .enabled(!armedGuard && total > 1)
        .onTouchesDown((event) => {
          'worklet';
          origin.value = { x: event.x, y: event.y };
          fled.value = 0;
          runOnJS(controller.touchDown)(item.key);
        })
        .onTouchesMove((event, manager) => {
          'worklet';
          if (armed.value === 1) {
            manager.activate();
            return;
          }
          if (fled.value === 0) {
            const dx = event.x - origin.value.x;
            const dy = event.y - origin.value.y;
            if (dx * dx + dy * dy > controller.slopSq) {
              fled.value = 1;
              manager.fail();
              runOnJS(controller.touchFled)();
            }
          }
        })
        .onUpdate((event) => {
          'worklet';
          runOnJS(controller.dragMove)(item.key, event.translationY, event.y);
        })
        .onTouchesUp(() => {
          'worklet';
          runOnJS(controller.dragEnd)(item.key);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(controller.dragEnd)(item.key);
        })
        .onFinalize(() => {
          'worklet';
          armed.value = 0;
          fled.value = 0;
          runOnJS(controller.gestureFinalize)(item.key);
        }),
    // Shared values are intentionally NOT deps: they are stable hook-owned
    // objects; reanimated reads them at event time through the closure.
    // (Including them here would make React's compiler rules reject the
    // worklet writes above as "mutating a hook argument".)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [armedGuard, controller, item.key, total],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shift.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        collapsable={false}
        onLayout={(event) => {
          const { height, y } = event.nativeEvent.layout;
          controller.register(item.key, shift, armed);
          controller.layout(item.key, y, height);
        }}
        style={[
          lifted
            ? [
                styles.lifted,
                {
                  backgroundColor: colors.surface,
                  shadowColor: '#000',
                },
              ]
            : null,
          animatedStyle,
        ]}
      >
        {renderItem(item, index, total, lifted, reorder)}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  lifted: {
    elevation: 6,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    zIndex: 10,
  },
});
