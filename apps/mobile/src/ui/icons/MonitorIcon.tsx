import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "../theme";
import type { IconProps } from "./types";

export function MonitorIcon({ size = 22, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="2"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M9 20h6M12 16v4"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}
