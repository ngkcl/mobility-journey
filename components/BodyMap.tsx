/**
 * BodyMap — Interactive SVG body silhouette with touchable anatomical zones.
 *
 * Renders a simplified human body outline (front or back view) with
 * color-coded overlay zones based on pain/tension intensity.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Ellipse, Text as SvgText } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { tapLight } from '../lib/haptics';
import {
  BODY_ZONES_FRONT,
  BODY_ZONES_BACK,
  intensityToColor,
  type BodyZoneId,
  type BodyMapEntry,
  type BodyZoneConfig,
} from '../lib/bodyMap';
import { colors } from '@/lib/theme';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// ─── SVG Body Silhouette Paths ───────────────────────────────────────────────

const BODY_FRONT_PATH = `
  M 150 20
  C 132 20, 120 32, 120 50
  C 120 65, 130 75, 150 75
  C 170 75, 180 65, 180 50
  C 180 32, 168 20, 150 20
  Z

  M 130 78
  L 128 100
  L 80 108
  L 55 145
  L 45 200
  L 50 240
  L 62 240
  L 72 195
  L 85 145
  L 100 128
  L 100 250
  L 95 260
  L 92 300
  L 98 365
  L 95 410
  L 95 465
  L 92 480
  L 110 480
  L 118 470
  L 120 410
  L 125 330
  L 135 290
  L 150 280
  L 165 290
  L 175 330
  L 180 410
  L 182 470
  L 190 480
  L 208 480
  L 205 465
  L 205 410
  L 202 365
  L 208 300
  L 205 260
  L 200 250
  L 200 128
  L 215 145
  L 228 195
  L 238 240
  L 250 240
  L 255 200
  L 245 145
  L 220 108
  L 172 100
  L 170 78
  Z
`;

const BODY_BACK_PATH = `
  M 150 20
  C 132 20, 120 32, 120 50
  C 120 65, 130 75, 150 75
  C 170 75, 180 65, 180 50
  C 180 32, 168 20, 150 20
  Z

  M 130 78
  L 128 100
  L 80 108
  L 55 145
  L 45 200
  L 50 240
  L 62 240
  L 72 195
  L 85 145
  L 100 128
  L 100 250
  L 95 260
  L 92 300
  L 98 365
  L 95 410
  L 95 465
  L 92 480
  L 110 480
  L 118 470
  L 120 410
  L 125 330
  L 135 290
  L 150 280
  L 165 290
  L 175 330
  L 180 410
  L 182 470
  L 190 480
  L 208 480
  L 205 465
  L 205 410
  L 202 365
  L 208 300
  L 205 260
  L 200 250
  L 200 128
  L 215 145
  L 228 195
  L 238 240
  L 250 240
  L 255 200
  L 245 145
  L 220 108
  L 172 100
  L 170 78
  Z

  M 120 140
  L 180 140

  M 115 180
  L 185 180

  M 118 210
  L 182 210
`;

// ─── Pulsing Zone for high-intensity entries ─────────────────────────────────

function PulsingZone({ zone, entry }: { zone: BodyZoneConfig; entry: BodyMapEntry }) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedProps = useAnimatedProps(() => ({
    opacity: opacity.value,
  }));

  const fill = intensityToColor(entry.intensity);
  const cx = zone.x + zone.width / 2;
  const cy = zone.y + zone.height / 2;

  return (
    <AnimatedEllipse
      cx={cx}
      cy={cy}
      rx={zone.width / 2 + 4}
      ry={zone.height / 2 + 4}
      fill={fill}
      animatedProps={animatedProps}
    />
  );
}

// ─── Zone Overlay ────────────────────────────────────────────────────────────

function ZoneOverlay({
  zone,
  entry,
  onPress,
}: {
  zone: BodyZoneConfig;
  entry: BodyMapEntry | null;
  onPress: (id: BodyZoneId) => void;
}) {
  const intensity = entry?.intensity ?? 0;
  const fill = intensity > 0 ? intensityToColor(intensity) : 'rgba(148, 163, 184, 0.08)';
  const cx = zone.x + zone.width / 2;
  const cy = zone.y + zone.height / 2;

  return (
    <>
      {intensity >= 7 && entry && <PulsingZone zone={zone} entry={entry} />}
      <Ellipse
        cx={cx}
        cy={cy}
        rx={zone.width / 2}
        ry={zone.height / 2}
        fill={fill}
        stroke={intensity > 0 ? 'rgba(255,255,255,0.15)' : 'rgba(148, 163, 184, 0.12)'}
        strokeWidth={1}
        onPress={() => {
          tapLight();
          onPress(zone.id);
        }}
      />
    </>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

type Props = {
  view: 'front' | 'back';
  entries: Record<string, BodyMapEntry | null>;
  onZoneTap: (zone: BodyZoneId) => void;
  editable?: boolean;
};

export default function BodyMap({ view, entries, onZoneTap, editable = true }: Props) {
  const zones = view === 'front' ? BODY_ZONES_FRONT : BODY_ZONES_BACK;
  const silhouettePath = view === 'front' ? BODY_FRONT_PATH : BODY_BACK_PATH;

  return (
    <View style={styles.container}>
      <Svg width="100%" height="100%" viewBox="0 0 300 500" preserveAspectRatio="xMidYMid meet">
        {/* Body outline */}
        <Path
          d={silhouettePath}
          fill="none"
          stroke={colors.textTertiary}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.5}
        />

        {/* Zone overlays */}
        {zones.map((zone) => (
          <ZoneOverlay
            key={zone.id}
            zone={zone}
            entry={entries[zone.id] ?? null}
            onPress={editable ? onZoneTap : () => {}}
          />
        ))}

        {/* Zone labels (only for zones with entries) */}
        {zones.map((zone) => {
          const entry = entries[zone.id];
          if (!entry) return null;
          const cx = zone.x + zone.width / 2;
          const cy = zone.y + zone.height / 2;
          return (
            <SvgText
              key={`label-${zone.id}`}
              x={cx}
              y={cy + 4}
              fill={colors.textPrimary}
              fontSize={9}
              fontWeight="600"
              textAnchor="middle"
              opacity={0.9}
            >
              {entry.intensity}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 300 / 500,
    maxHeight: 480,
    alignSelf: 'center',
  },
});
