import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function ScanIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Rect x="8" y="8" width="3" height="3" rx="0.5" stroke={color} strokeWidth={1.5} />
      <Rect x="13" y="8" width="3" height="3" rx="0.5" stroke={color} strokeWidth={1.5} />
      <Rect x="8" y="13" width="3" height="3" rx="0.5" stroke={color} strokeWidth={1.5} />
      <Path d="M13 13h3v3" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
